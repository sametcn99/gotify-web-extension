import {
	configureOriginBypass,
	fetchAllMessages,
	fetchApplications,
	fetchMessagesAfter,
	getLatestMessageId,
	normalizeBaseUrl,
	request,
	validateClientToken,
} from "./background/gotify-api";
import {
	deduplicateAndSortMessages,
	getProcessingCursor,
	normalizeMessagePreview,
} from "./background/message-state";
import { canNotifyMessage, notifyMessages } from "./background/notifications";
import {
	clearConfig,
	DEFAULT_NOTIFICATION_SETTINGS,
	DEFAULT_POLL_INTERVAL_SECONDS,
	loadConfig,
	loadState,
	resetState,
	saveConfig,
	saveState,
} from "./shared/storage";
import type {
	BackgroundRequest,
	BackgroundResponse,
	GotifyConfig,
	GotifyMessage,
	LoginPayload,
	RuntimeState,
} from "./shared/types";

const UI_PATH = "index.html";
const POLL_ALARM_NAME = "gotify.poll.messages";
const MIN_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 3600;
const MAX_RECENT_MESSAGES = 40;
const MAX_NOTIFICATION_TARGETS = 100;

let pollingTimer: ReturnType<typeof setInterval> | undefined;
let syncInProgress = false;
let messageProcessingQueue: Promise<void> = Promise.resolve();
let lifecycleQueue: Promise<void> = Promise.resolve();
let connectionGeneration = 0;
let activeConnectionGeneration: number | undefined;

const runLifecycle = <T>(operation: () => Promise<T>): Promise<T> => {
	const result = lifecycleQueue.then(operation, operation);
	lifecycleQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};

const runMessageStateOperation = <T>(
	operation: () => Promise<T>,
): Promise<T> => {
	const result = messageProcessingQueue.then(operation, operation);
	messageProcessingQueue = result.then(
		() => undefined,
		() => undefined,
	);
	return result;
};

type ActionLikeApi = {
	setBadgeText: (details: { text: string }) => Promise<void>;
	setBadgeBackgroundColor: (details: { color: string }) => Promise<void>;
	onClicked: {
		addListener: (listener: () => void) => void;
	};
};

const browserAction =
	(
		browser as unknown as {
			action?: ActionLikeApi;
			browserAction: ActionLikeApi;
		}
	).action ??
	(browser as unknown as { browserAction: ActionLikeApi }).browserAction;
const createRuntimeState = (
	previous: RuntimeState,
	update: Partial<RuntimeState>,
): RuntimeState => ({
	...previous,
	...update,
});

const publishState = async (
	partial: Partial<RuntimeState>,
): Promise<RuntimeState> => {
	const previous = await loadState();
	const nextState = createRuntimeState(previous, partial);
	await saveState(nextState);
	return nextState;
};

const normalizePollInterval = (seconds: number): number =>
	Math.min(
		Math.max(Math.round(seconds), MIN_POLL_INTERVAL_SECONDS),
		MAX_POLL_INTERVAL_SECONDS,
	);

const runScheduledSync = async (
	config?: GotifyConfig,
	generation = activeConnectionGeneration ?? -1,
): Promise<void> => {
	if (syncInProgress) {
		return;
	}

	syncInProgress = true;
	try {
		await syncMessages(config, generation);
	} finally {
		syncInProgress = false;
	}
};

const schedulePolling = async (config: GotifyConfig): Promise<void> => {
	if (pollingTimer !== undefined) {
		clearInterval(pollingTimer);
	}

	await browser.alarms.clear(POLL_ALARM_NAME);
	const intervalSeconds = normalizePollInterval(
		config.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
	);
	pollingTimer = setInterval(() => {
		void runScheduledSync();
	}, intervalSeconds * 1000);

	// Alarms recover polling when Chromium suspends and later wakes the worker.
	await browser.alarms.create(POLL_ALARM_NAME, {
		periodInMinutes: Math.max(intervalSeconds, 30) / 60,
	});
};

const stopPolling = async (): Promise<void> => {
	if (pollingTimer !== undefined) {
		clearInterval(pollingTimer);
		pollingTimer = undefined;
	}
	await browser.alarms.clear(POLL_ALARM_NAME);
};

const loadMessages = async (
	applicationId?: number,
): Promise<BackgroundResponse> => {
	const config = await loadConfig();
	if (!config) {
		return { ok: false, error: "Login is required" };
	}

	try {
		const messages = await fetchAllMessages(config, applicationId);
		return { ok: true, messages };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Loading messages failed",
		};
	}
};

const describeHttpFailure = async (
	response: Response,
	action: string,
): Promise<string> => {
	let details = "";
	try {
		details = (await response.text()).trim();
	} catch {
		details = "Response body could not be read";
	}
	const responseHeaders = ["server", "via", "allow", "cf-ray", "x-powered-by"]
		.map((name) => `${name}=${response.headers.get(name) ?? "(missing)"}`)
		.join(", ");

	return [
		`${action} failed: ${response.status} ${response.statusText || "(no status text)"}`,
		`URL: ${response.url}`,
		`Content-Type: ${response.headers.get("content-type") ?? "(missing)"}`,
		`Response headers: ${responseHeaders}`,
		details ||
			"Response body is empty; check the Gotify or reverse-proxy logs.",
	]
		.filter(Boolean)
		.join(" - ");
};

const deleteMessage = async (
	messageId: number,
): Promise<BackgroundResponse> => {
	const config = await loadConfig();
	const generation = activeConnectionGeneration;
	if (!config || generation === undefined) {
		return { ok: false, error: "Login is required" };
	}

	try {
		const response = await request(config, `/message/${messageId}`, {
			method: "DELETE",
		});
		if (!response.ok) {
			return {
				ok: false,
				error: await describeHttpFailure(response, "Deleting message"),
			};
		}
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? `Deleting message request failed: ${error.message}`
					: "Deleting message request failed: network or CORS error",
		};
	}

	const state = await runMessageStateOperation(async () => {
		if (!(await isActiveConnection(config, generation))) return loadState();
		const previous = await loadState();
		const next = createRuntimeState(previous, {
			recentMessages: previous.recentMessages.filter(
				(message) => message.id !== messageId,
			),
		});
		await saveState(next);
		return next;
	});
	return { ok: true, state };
};

const deleteAllMessages = async (
	applicationId?: number,
): Promise<BackgroundResponse> => {
	const config = await loadConfig();
	const generation = activeConnectionGeneration;
	if (!config || generation === undefined) {
		return { ok: false, error: "Login is required" };
	}

	const path =
		applicationId === undefined
			? "/message"
			: `/application/${applicationId}/message`;
	try {
		const response = await request(config, path, { method: "DELETE" });
		if (!response.ok) {
			return {
				ok: false,
				error: await describeHttpFailure(response, "Deleting messages"),
			};
		}
	} catch (error) {
		return {
			ok: false,
			error:
				error instanceof Error
					? `Deleting messages request failed: ${error.message}`
					: "Deleting messages request failed: network or CORS error",
		};
	}

	const state = await runMessageStateOperation(async () => {
		if (!(await isActiveConnection(config, generation))) return loadState();
		const previous = await loadState();
		const next = createRuntimeState(previous, {
			recentMessages:
				applicationId === undefined
					? []
					: previous.recentMessages.filter(
							(message) => message.appid !== applicationId,
						),
			unreadCount: 0,
		});
		await saveState(next);
		return next;
	});
	if (await isActiveConnection(config, generation)) {
		await browserAction.setBadgeText({ text: "" });
	}
	return { ok: true, state };
};

const isActiveConnection = async (
	config: GotifyConfig,
	generation: number,
): Promise<boolean> => {
	if (generation !== connectionGeneration) return false;
	const activeConfig = await loadConfig();
	return (
		generation === connectionGeneration &&
		activeConfig?.baseUrl === config.baseUrl &&
		activeConfig.token === config.token
	);
};

const processIncomingMessages = (
	config: GotifyConfig,
	incoming: GotifyMessage[],
	generation = connectionGeneration,
): Promise<RuntimeState> => {
	return runMessageStateOperation(async () => {
		if (!(await isActiveConnection(config, generation))) return loadState();
		const activeConfig = (await loadConfig()) ?? config;
		const previous = await loadState();
		const cursor = getProcessingCursor(previous) ?? 0;
		const newMessages = deduplicateAndSortMessages(incoming).filter(
			(message) => message.id > cursor,
		);
		const nextCursor = Math.max(
			cursor,
			...incoming.map((message) => message.id),
		);
		let applications = previous.applications;
		if (!applications) {
			try {
				applications = await fetchApplications(activeConfig);
			} catch {
				// Retry on a later sync instead of caching a transient failure.
			}
		}
		if (!(await isActiveConnection(config, generation))) return loadState();
		const notificationSettings = {
			...DEFAULT_NOTIFICATION_SETTINGS,
			...activeConfig.notificationSettings,
			disabledApplicationIds:
				activeConfig.notificationSettings?.disabledApplicationIds ?? [],
		};
		const merged = normalizeMessagePreview(
			[...incoming, ...previous.recentMessages],
			MAX_RECENT_MESSAGES,
		);
		let nextState = createRuntimeState(previous, {
			status: "connected",
			error: undefined,
			notificationsInitialized: true,
			lastSyncAt: Date.now(),
			lastProcessedMessageId: nextCursor,
			recentMessages: merged,
			applications,
			config: {
				baseUrl: activeConfig.baseUrl,
				authMode: activeConfig.authMode,
				hasToken: Boolean(activeConfig.token),
				pollIntervalSeconds:
					activeConfig.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
				notificationSettings,
			},
		});

		// Persist the cursor before displaying notifications. A suspended worker
		// can then never replay an already processed message.
		await saveState(nextState);
		if (!(await isActiveConnection(config, generation))) return loadState();
		const messagesToNotify = newMessages
			.filter((message) => canNotifyMessage(message, notificationSettings))
			.sort((a, b) => a.id - b.id);
		if (messagesToNotify.length === 0) return nextState;

		const uiVisible = await isUiVisible();
		const unreadCount = uiVisible
			? 0
			: (previous.unreadCount ?? 0) + messagesToNotify.length;
		nextState = createRuntimeState(nextState, { unreadCount });
		await saveState(nextState);
		if (!(await isActiveConnection(config, generation))) return loadState();
		if (uiVisible) {
			await browserAction.setBadgeText({ text: "" });
		} else {
			await browserAction.setBadgeText({ text: String(unreadCount) });
			await browserAction.setBadgeBackgroundColor({ color: "#1976d2" });
		}

		try {
			const notificationResult = await notifyMessages(
				messagesToNotify,
				applications ?? {},
			);
			if (!(await isActiveConnection(config, generation))) {
				await Promise.all(
					notificationResult.notificationIds.map((id) =>
						browser.notifications.clear(id),
					),
				);
				return loadState();
			}
			const notificationTargets = {
				...(previous.notificationTargets ?? {}),
				...notificationResult.targets,
			};
			nextState = createRuntimeState(nextState, {
				notificationTargets: Object.fromEntries(
					Object.entries(notificationTargets).slice(-MAX_NOTIFICATION_TARGETS),
				),
			});
			await saveState(nextState);
		} catch {
			// Cursor persistence is more important than replaying a failed native
			// notification on every subsequent sync.
		}
		return nextState;
	});
};

const syncMessages = async (
	providedConfig?: GotifyConfig,
	generation = activeConnectionGeneration ?? -1,
): Promise<RuntimeState> => {
	const config = providedConfig ?? (await loadConfig());
	if (!config) {
		const state = await resetState();
		return state;
	}

	try {
		if (!(await isActiveConnection(config, generation))) return loadState();
		const previous = await loadState();
		let cursor = getProcessingCursor(previous);
		if (cursor === undefined) {
			cursor = await getLatestMessageId(config);
			if (!(await isActiveConnection(config, generation))) return loadState();
			return publishState({
				status: "connected",
				error: undefined,
				lastSyncAt: Date.now(),
				lastProcessedMessageId: cursor,
				notificationBaselineId: cursor,
				notificationsInitialized: true,
			});
		}
		const incoming = await fetchMessagesAfter(config, cursor);
		if (!(await isActiveConnection(config, generation))) return loadState();
		return processIncomingMessages(config, incoming, generation);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown sync error";
		if (!(await isActiveConnection(config, generation))) return loadState();
		const previous = await loadState();
		const next = await publishState({
			status: previous.status === "logged_out" ? "logged_out" : "error",
			error: message,
		});
		return next;
	}
};

const loginForGeneration = async (
	payload: LoginPayload,
	generation: number,
): Promise<BackgroundResponse> => {
	try {
		await stopPolling();
		await messageProcessingQueue;
		const baseUrl = normalizeBaseUrl(payload.baseUrl);
		const token = payload.token.trim();

		const config: GotifyConfig = {
			baseUrl,
			authMode: "token",
			token,
			notificationSettings: {
				...DEFAULT_NOTIFICATION_SETTINGS,
				disabledApplicationIds: [],
			},
		};

		if (!config.baseUrl || !config.token) {
			return {
				ok: false,
				error: "Gotify URL and client token are required",
			};
		}

		await publishState({
			status: "connecting",
			error: undefined,
		});

		const user = await validateClientToken(config);
		const notificationBaselineId = await getLatestMessageId(config);
		if (generation !== connectionGeneration) {
			return { ok: false, error: "Login was superseded" };
		}

		await configureOriginBypass(config);
		if (generation !== connectionGeneration) {
			return { ok: false, error: "Login was superseded" };
		}
		await saveConfig(config);
		activeConnectionGeneration = generation;

		const nextState = await publishState({
			status: "connected",
			error: undefined,
			user,
			config: {
				baseUrl: config.baseUrl,
				authMode: config.authMode,
				hasToken: Boolean(config.token),
			},
			recentMessages: [],
			lastProcessedMessageId: notificationBaselineId,
			notificationBaselineId,
			notificationsInitialized: false,
			lastSyncAt: Date.now(),
		});

		await schedulePolling(config);
		const synced = await syncMessages(config, generation);
		if (generation !== connectionGeneration) {
			return { ok: false, error: "Login was superseded" };
		}
		return { ok: true, state: { ...nextState, ...synced } };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Login failed";
		if (generation === connectionGeneration) {
			await publishState({ status: "error", error: message });
		}
		return { ok: false, error: message };
	}
};

const login = (payload: LoginPayload): Promise<BackgroundResponse> => {
	const generation = ++connectionGeneration;
	activeConnectionGeneration = undefined;
	return runLifecycle(() => loginForGeneration(payload, generation));
};

const logout = (): Promise<BackgroundResponse> => {
	connectionGeneration += 1;
	activeConnectionGeneration = undefined;
	return runLifecycle(async () => {
		await stopPolling();
		await messageProcessingQueue;
		await configureOriginBypass(null);
		await clearConfig();
		await browserAction.setBadgeText({ text: "" });
		const state = await resetState();
		return { ok: true, state };
	});
};

const getStateResponse = async (): Promise<BackgroundResponse> => {
	const state = await loadState();
	return { ok: true, state };
};

const handleMessage = async (
	request: BackgroundRequest,
): Promise<BackgroundResponse> => {
	switch (request.type) {
		case "gotify/login":
			return login(request.payload);
		case "gotify/logout":
			return logout();
		case "gotify/state":
			return getStateResponse();
		case "gotify/sync": {
			await runScheduledSync();
			const state = await loadState();
			return { ok: true, state };
		}
		case "gotify/clear-recent-messages": {
			const state = await publishState({ recentMessages: [], unreadCount: 0 });
			await browserAction.setBadgeText({ text: "" });
			return { ok: true, state };
		}
		case "gotify/mark-ui-visible":
			return { ok: true, state: await markUiVisible() };
		case "gotify/load-messages":
			return loadMessages(request.applicationId);
		case "gotify/delete-message":
			return deleteMessage(request.messageId);
		case "gotify/delete-all-messages":
			return deleteAllMessages(request.applicationId);
		case "gotify/update-settings": {
			const config = await loadConfig();
			if (!config) {
				return { ok: false, error: "Login is required" };
			}
			const pollIntervalSeconds = normalizePollInterval(
				request.pollIntervalSeconds,
			);
			const updatedConfig = { ...config, pollIntervalSeconds };
			if (request.notificationSettings) {
				updatedConfig.notificationSettings = {
					...DEFAULT_NOTIFICATION_SETTINGS,
					...request.notificationSettings,
					disabledApplicationIds:
						request.notificationSettings.disabledApplicationIds,
				};
			}
			await saveConfig(updatedConfig);
			await schedulePolling(updatedConfig);
			const state = await publishState({
				config: {
					baseUrl: updatedConfig.baseUrl,
					authMode: updatedConfig.authMode,
					hasToken: Boolean(updatedConfig.token),
					pollIntervalSeconds,
					notificationSettings: updatedConfig.notificationSettings,
				},
			});
			return { ok: true, state };
		}
		default:
			return { ok: false, error: "Unknown request type" };
	}
};

const openUiTab = async () => {
	const extensionUrl = browser.runtime.getURL(UI_PATH);
	await browser.tabs.create({ url: extensionUrl });
};

// The extension's own tab URL is visible to tabs.query() without the "tabs"
// permission; only third-party tab URLs would be redacted.
const isUiVisible = async (): Promise<boolean> => {
	const extensionUrl = browser.runtime.getURL(UI_PATH);
	try {
		const [activeTab] = await browser.tabs.query({
			active: true,
			lastFocusedWindow: true,
		});
		return Boolean(activeTab?.url?.startsWith(extensionUrl));
	} catch {
		return false;
	}
};

const markUiVisible = async (): Promise<RuntimeState> => {
	const state = await publishState({ unreadCount: 0 });
	await browserAction.setBadgeText({ text: "" });
	return state;
};

const openUi = async (): Promise<void> => {
	await markUiVisible();
	await openUiTab();
};

let initializationPromise: Promise<void> | undefined;
const initializeConnection = (): Promise<void> => {
	if (initializationPromise) return initializationPromise;
	const generation = ++connectionGeneration;
	initializationPromise = runLifecycle(async () => {
		const config = await loadConfig();
		if (generation !== connectionGeneration) return;
		await configureOriginBypass(config);
		if (generation !== connectionGeneration || !config) return;
		activeConnectionGeneration = generation;
		await schedulePolling(config);
		await syncMessages(config, generation);
	});
	return initializationPromise;
};

browser.runtime.onInstalled.addListener(() => void initializeConnection());
browser.runtime.onStartup.addListener(() => void initializeConnection());

browser.alarms.onAlarm.addListener(async (alarm: { name: string }) => {
	if (alarm.name !== POLL_ALARM_NAME) {
		return;
	}
	await runScheduledSync();
});

browser.runtime.onMessage.addListener(async (request: unknown) => {
	try {
		return await handleMessage(request as BackgroundRequest);
	} catch (error) {
		const message = error instanceof Error ? error.message : "Unhandled error";
		return { ok: false, error: message } satisfies BackgroundResponse;
	}
});

browser.notifications.onClicked.addListener(async (notificationId: string) => {
	await browser.notifications.clear(notificationId);

	const state = await loadState();
	const targetUrl = state.notificationTargets?.[notificationId];
	if (targetUrl) {
		await browser.tabs.create({ url: targetUrl });
		return;
	}

	const config = await loadConfig();
	if (!config?.baseUrl) {
		return;
	}

	await browser.tabs.create({ url: config.baseUrl });
});

const isFirefoxLike =
	import.meta.env.EXTENSION_PUBLIC_BROWSER === "firefox" ||
	import.meta.env.EXTENSION_PUBLIC_BROWSER === "gecko-based";

if (isFirefoxLike) {
	browser.browserAction.onClicked.addListener(() => {
		void openUi();
	});
} else {
	browserAction.onClicked.addListener(() => {
		void openUi();
	});
}

void initializeConnection();
