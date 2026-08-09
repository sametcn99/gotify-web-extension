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
	CurrentUser,
	GotifyApplication,
	GotifyConfig,
	GotifyMessage,
	LoginPayload,
	NotificationSettings,
	PagedMessages,
	RuntimeState,
} from "./shared/types";

const UI_PATH = "index.html";
const POLL_ALARM_NAME = "gotify.poll.messages";
const MIN_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 3600;
const MAX_RECENT_MESSAGES = 40;
const MAX_NOTIFICATION_TARGETS = 100;
const MESSAGE_PAGE_SIZE = 200;
const MAX_MESSAGE_PAGES = 50;

let pollingTimer: ReturnType<typeof setInterval> | undefined;
let syncInProgress = false;

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

const toBaseUrl = (rawUrl: string): string => {
	const url = new URL(rawUrl);
	const withoutTrailingSlash = url.toString().replace(/\/+$/, "");
	return withoutTrailingSlash;
};

const getApiHeaders = (config: GotifyConfig): HeadersInit => {
	if (config.token) {
		return { "X-Gotify-Key": config.token };
	}
	return {};
};

const getFetchInit = (config: GotifyConfig): RequestInit => {
	return { headers: getApiHeaders(config) };
};

const buildRequest = (
	config: GotifyConfig,
	path: string,
	init?: RequestInit,
) => {
	const url = `${config.baseUrl}${path}`;
	return fetch(url, {
		...getFetchInit(config),
		...(init ?? {}),
		headers: {
			...getApiHeaders(config),
			...(init?.headers ?? {}),
		},
	});
};

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

const deduplicateAndSortMessages = (messages: GotifyMessage[]) => {
	const uniqueMessages = new Map<number, GotifyMessage>();
	for (const message of messages) {
		if (!uniqueMessages.has(message.id)) {
			uniqueMessages.set(message.id, message);
		}
	}

	return [...uniqueMessages.values()].sort((a, b) => b.id - a.id);
};

const normalizeMessagePreview = (messages: GotifyMessage[]) =>
	deduplicateAndSortMessages(messages).slice(0, MAX_RECENT_MESSAGES);

const isHttpUrl = (value: string): boolean => {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:";
	} catch {
		return false;
	}
};

const findMessageUrl = (value: unknown): string | undefined => {
	if (!value || typeof value !== "object") {
		return undefined;
	}

	for (const [key, nestedValue] of Object.entries(
		value as Record<string, unknown>,
	)) {
		if (
			["url", "href", "link"].includes(key.toLowerCase()) &&
			typeof nestedValue === "string" &&
			isHttpUrl(nestedValue)
		) {
			return nestedValue;
		}
		const nestedUrl = findMessageUrl(nestedValue);
		if (nestedUrl) {
			return nestedUrl;
		}
	}

	return undefined;
};

const getMessageUrl = (message: GotifyMessage): string | undefined =>
	findMessageUrl(message.extras);

const parseTimeOfDay = (value: string): number | undefined => {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) {
		return undefined;
	}

	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) {
		return undefined;
	}

	return hours * 60 + minutes;
};

const isQuietHours = (settings: NotificationSettings): boolean => {
	if (!settings.quietHoursEnabled) {
		return false;
	}

	const start = parseTimeOfDay(settings.quietHoursStart);
	const end = parseTimeOfDay(settings.quietHoursEnd);
	if (start === undefined || end === undefined || start === end) {
		return false;
	}

	const now = new Date();
	const current = now.getHours() * 60 + now.getMinutes();
	return start < end
		? current >= start && current < end
		: current >= start || current < end;
};

const canNotifyMessage = (
	message: GotifyMessage,
	settings: NotificationSettings,
): boolean =>
	!settings.disabledApplicationIds.includes(message.appid) &&
	!isQuietHours(settings);

const getApplicationName = (
	message: GotifyMessage,
	applications: Record<string, GotifyApplication>,
): string | undefined => applications[String(message.appid)]?.name;

const notifyNewMessages = async (
	messages: GotifyMessage[],
	applications: Record<string, GotifyApplication>,
): Promise<Record<string, string>> => {
	const notificationTargets: Record<string, string> = {};
	if (messages.length === 1) {
		const [message] = messages;
		const notificationId = `gotify-${message.id}`;
		const applicationName = getApplicationName(message, applications);
		await browser.notifications.create(notificationId, {
			type: "basic",
			iconUrl: browser.runtime.getURL("images/icon.png"),
			title: [applicationName, message.title?.trim() || "Gotify Notification"]
				.filter(Boolean)
				.join(" | "),
			message: message.message?.trim() || "(empty message)",
			priority: Math.max(Math.min(message.priority ?? 0, 2), -2),
			requireInteraction: (message.priority ?? 0) >= 8,
		});
		const url = getMessageUrl(message);
		if (url) {
			notificationTargets[notificationId] = url;
		}
	} else if (messages.length > 1) {
		const highestPriority = Math.max(
			...messages.map((message) => message.priority ?? 0),
		);
		const lastMessage = messages[messages.length - 1];
		const notificationId = `gotify-batch-${lastMessage.id}`;

		await browser.notifications.create(notificationId, {
			type: "basic",
			iconUrl: browser.runtime.getURL("images/icon.png"),
			title: "Gotify Notifications",
			message: `${messages.length} new notifications`,
			priority: Math.max(Math.min(highestPriority, 2), -2),
			requireInteraction: highestPriority >= 8,
		});
		const url = getMessageUrl(lastMessage);
		if (url) {
			notificationTargets[notificationId] = url;
		}
	}

	if (messages.length > 0) {
		await browserAction.setBadgeText({ text: String(messages.length) });
		await browserAction.setBadgeBackgroundColor({ color: "#1976d2" });
	}

	return notificationTargets;
};

const normalizePollInterval = (seconds: number): number =>
	Math.min(
		Math.max(Math.round(seconds), MIN_POLL_INTERVAL_SECONDS),
		MAX_POLL_INTERVAL_SECONDS,
	);

const runScheduledSync = async (): Promise<void> => {
	if (syncInProgress) {
		return;
	}

	syncInProgress = true;
	try {
		await syncMessages();
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

const fetchApplications = async (
	config: GotifyConfig,
): Promise<Record<string, GotifyApplication>> => {
	try {
		const response = await buildRequest(config, "/application", {
			method: "GET",
		});
		if (!response.ok) {
			return {};
		}

		const applications = (await response.json()) as GotifyApplication[];
		return Object.fromEntries(
			applications.map((application) => [String(application.id), application]),
		);
	} catch {
		return {};
	}
};

const fetchMessages = async (
	config: GotifyConfig,
	applicationId?: number,
): Promise<GotifyMessage[]> => {
	let path =
		applicationId === undefined
			? `/message?limit=${MESSAGE_PAGE_SIZE}`
			: `/application/${applicationId}/message?limit=${MESSAGE_PAGE_SIZE}`;
	const messages: GotifyMessage[] = [];

	for (let page = 0; page < MAX_MESSAGE_PAGES; page += 1) {
		const response = await buildRequest(config, path, { method: "GET" });
		if (!response.ok) {
			throw new Error(`Loading messages failed: ${response.status}`);
		}

		const payload = (await response.json()) as PagedMessages;
		messages.push(...(payload.messages ?? []));
		if (!payload.paging?.next) {
			break;
		}
		path = payload.paging.next;
	}

	return deduplicateAndSortMessages(messages);
};

const loadMessages = async (
	applicationId?: number,
): Promise<BackgroundResponse> => {
	const config = await loadConfig();
	if (!config) {
		return { ok: false, error: "Login is required" };
	}

	try {
		const messages = await fetchMessages(config, applicationId);
		return { ok: true, messages };
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : "Loading messages failed",
		};
	}
};

const deleteMessage = async (
	messageId: number,
): Promise<BackgroundResponse> => {
	const config = await loadConfig();
	if (!config) {
		return { ok: false, error: "Login is required" };
	}

	const response = await buildRequest(config, `/message/${messageId}`, {
		method: "DELETE",
	});
	if (!response.ok) {
		return { ok: false, error: `Deleting message failed: ${response.status}` };
	}

	const previous = await loadState();
	const state = await publishState({
		recentMessages: previous.recentMessages.filter(
			(message) => message.id !== messageId,
		),
	});
	return { ok: true, state };
};

const deleteAllMessages = async (
	applicationId?: number,
): Promise<BackgroundResponse> => {
	const config = await loadConfig();
	if (!config) {
		return { ok: false, error: "Login is required" };
	}

	const path =
		applicationId === undefined
			? "/message"
			: `/application/${applicationId}/message`;
	const response = await buildRequest(config, path, { method: "DELETE" });
	if (!response.ok) {
		return { ok: false, error: `Deleting messages failed: ${response.status}` };
	}

	const previous = await loadState();
	const state = await publishState({
		recentMessages:
			applicationId === undefined
				? []
				: previous.recentMessages.filter(
						(message) => message.appid !== applicationId,
					),
	});
	await browserAction.setBadgeText({ text: "" });
	return { ok: true, state };
};

const syncMessages = async (): Promise<RuntimeState> => {
	const config = await loadConfig();
	if (!config) {
		const state = await resetState();
		return state;
	}

	const prevState = await loadState();
	const since = prevState.lastMessageSince ?? 0;

	try {
		const response = await buildRequest(
			config,
			`/message?since=${since}&limit=40`,
			{
				method: "GET",
			},
		);

		if (!response.ok) {
			const errorText = `Sync failed with status ${response.status}`;
			const next = await publishState({
				status: prevState.status === "logged_out" ? "logged_out" : "error",
				error: errorText,
			});
			return next;
		}

		const payload = (await response.json()) as PagedMessages;
		const incoming = payload.messages ?? [];
		const applications =
			prevState.applications ?? (await fetchApplications(config));
		const notificationSettings = {
			...DEFAULT_NOTIFICATION_SETTINGS,
			...config.notificationSettings,
			disabledApplicationIds:
				config.notificationSettings?.disabledApplicationIds ?? [],
		};

		const knownIds = new Set(prevState.recentMessages.map((msg) => msg.id));
		const unseen = incoming.filter((msg) => !knownIds.has(msg.id));
		const shouldNotify = prevState.notificationsInitialized === true;
		const messagesAfterConnection = incoming.filter(
			(msg) =>
				prevState.notificationBaselineId !== undefined &&
				msg.id > prevState.notificationBaselineId &&
				!knownIds.has(msg.id),
		);
		const messagesToNotify = (
			shouldNotify ? unseen : messagesAfterConnection
		).filter((message) => canNotifyMessage(message, notificationSettings));

		if (messagesToNotify.length > 0) {
			const targets = await notifyNewMessages(
				messagesToNotify.sort((a, b) => a.id - b.id),
				applications,
			);
			Object.assign(prevState.notificationTargets ?? {}, targets);
		}

		const merged = normalizeMessagePreview([
			...incoming,
			...prevState.recentMessages,
		]);

		const next = await publishState({
			status: "connected",
			error: undefined,
			notificationsInitialized: true,
			lastSyncAt: Date.now(),
			lastMessageSince: payload.paging?.since ?? since,
			recentMessages: merged,
			applications,
			notificationTargets: Object.fromEntries(
				Object.entries(prevState.notificationTargets ?? {}).slice(
					-MAX_NOTIFICATION_TARGETS,
				),
			),
			config: {
				baseUrl: config.baseUrl,
				authMode: config.authMode,
				hasToken: Boolean(config.token),
				pollIntervalSeconds:
					config.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
				notificationSettings,
			},
		});

		return next;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown sync error";
		const next = await publishState({
			status: prevState.status === "logged_out" ? "logged_out" : "error",
			error: message,
		});
		return next;
	}
};

const validateTokenLogin = async (
	config: GotifyConfig,
): Promise<CurrentUser> => {
	const response = await buildRequest(config, "/current/user", {
		method: "GET",
	});
	if (!response.ok) {
		throw new Error(`Token validation failed: ${response.status}`);
	}
	return (await response.json()) as CurrentUser;
};

const getLatestMessageId = async (config: GotifyConfig): Promise<number> => {
	const response = await buildRequest(config, "/message?limit=1", {
		method: "GET",
	});
	if (!response.ok) {
		throw new Error(`Message baseline failed: ${response.status}`);
	}

	const payload = (await response.json()) as PagedMessages;
	return payload.messages?.reduce(
		(latestId, message) => Math.max(latestId, message.id),
		0,
	);
};

const login = async (payload: LoginPayload): Promise<BackgroundResponse> => {
	try {
		const baseUrl = toBaseUrl(payload.baseUrl);
		const token = payload.token.trim();

		const config: GotifyConfig = {
			baseUrl,
			authMode: "token",
			token,
			notificationSettings: { ...DEFAULT_NOTIFICATION_SETTINGS },
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

		const user = await validateTokenLogin(config);
		const notificationBaselineId = await getLatestMessageId(config);

		await saveConfig(config);

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
			lastMessageSince: 0,
			notificationBaselineId,
			notificationsInitialized: false,
			lastSyncAt: Date.now(),
		});

		await schedulePolling(config);

		const synced = await syncMessages();
		return { ok: true, state: { ...nextState, ...synced } };
	} catch (error) {
		const message = error instanceof Error ? error.message : "Login failed";
		await publishState({ status: "error", error: message });
		return { ok: false, error: message };
	}
};

const logout = async (): Promise<BackgroundResponse> => {
	await stopPolling();
	await clearConfig();
	await browserAction.setBadgeText({ text: "" });
	const state = await resetState();

	return { ok: true, state };
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
			const state = await publishState({ recentMessages: [] });
			await browserAction.setBadgeText({ text: "" });
			return { ok: true, state };
		}
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

browser.runtime.onInstalled.addListener(async () => {
	const config = await loadConfig();
	if (config) {
		await schedulePolling(config);
		await syncMessages();
	}
});

browser.runtime.onStartup.addListener(async () => {
	const config = await loadConfig();
	if (config) {
		await schedulePolling(config);
		await syncMessages();
	}
});

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
		void openUiTab();
	});
} else {
	browserAction.onClicked.addListener(() => {
		void openUiTab();
	});
}
