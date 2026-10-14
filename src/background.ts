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
import { checkForUpdate } from "./background/update-check";
import {
	createInitialServerState,
	createServerId,
	DEFAULT_NOTIFICATION_SETTINGS,
	DEFAULT_POLL_INTERVAL_SECONDS,
	loadServers,
	loadState,
	migrateSingleServerStorage,
	removeServerFromState,
	saveServers,
	saveState,
	sumUnreadCount,
} from "./shared/storage";
import type {
	BackgroundRequest,
	BackgroundResponse,
	GotifyMessage,
	LoginPayload,
	NotificationSettings,
	RuntimeState,
	ServerConfig,
	ServerRuntimeState,
} from "./shared/types";

const UI_PATH = "index.html";
const POLL_ALARM_NAME = "gotify.poll.messages";
// Only a recovery net for per-server timers when Chromium suspends and wakes
// the worker; Chrome may clamp anything below one minute, which is fine here.
const POLL_RECOVERY_ALARM_PERIOD_MINUTES = 0.5;
const UPDATE_CHECK_ALARM_NAME = "gotify.check.update";
const UPDATE_CHECK_INTERVAL_MINUTES = 12 * 60;
const MIN_POLL_INTERVAL_SECONDS = 5;
const MAX_POLL_INTERVAL_SECONDS = 3600;
const MAX_RECENT_MESSAGES = 40;

type PollingTimer = {
	timer: ReturnType<typeof setInterval>;
	intervalSeconds: number;
};

const pollingTimers = new Map<string, PollingTimer>();
const syncInFlight = new Set<string>();
let messageProcessingQueue: Promise<void> = Promise.resolve();
let lifecycleQueue: Promise<void> = Promise.resolve();

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

const withServerSlice = (
	state: RuntimeState,
	serverId: string,
	slice: ServerRuntimeState,
): RuntimeState => {
	const servers = { ...state.servers, [serverId]: slice };
	return { ...state, servers, unreadCount: sumUnreadCount(servers) };
};

const publishServerState = async (
	serverId: string,
	update: Partial<ServerRuntimeState>,
): Promise<RuntimeState> => {
	const previous = await loadState();
	const slice = previous.servers[serverId] ?? createInitialServerState();
	const next = withServerSlice(previous, serverId, { ...slice, ...update });
	await saveState(next);
	return next;
};

const updateBadge = async (state?: RuntimeState): Promise<void> => {
	const unreadCount = sumUnreadCount((state ?? (await loadState())).servers);
	if (unreadCount > 0) {
		await browserAction.setBadgeText({ text: String(unreadCount) });
		await browserAction.setBadgeBackgroundColor({ color: "#1976d2" });
	} else {
		await browserAction.setBadgeText({ text: "" });
	}
};

const serverHostLabel = (baseUrl: string): string => {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
};

const normalizePollInterval = (seconds: number): number =>
	Math.min(
		Math.max(Math.round(seconds), MIN_POLL_INTERVAL_SECONDS),
		MAX_POLL_INTERVAL_SECONDS,
	);

const stopServerPolling = (serverId: string): void => {
	const polling = pollingTimers.get(serverId);
	if (polling) {
		clearInterval(polling.timer);
		pollingTimers.delete(serverId);
	}
};

const scheduleServerPolling = (server: ServerConfig): void => {
	const intervalSeconds = normalizePollInterval(
		server.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
	);
	const existing = pollingTimers.get(server.id);
	// Keep a live timer running when nothing changed; resetting it on every
	// recovery alarm would starve intervals longer than the alarm period.
	if (existing?.intervalSeconds === intervalSeconds) return;
	if (existing) clearInterval(existing.timer);
	pollingTimers.set(server.id, {
		timer: setInterval(
			() => void runScheduledSync(server.id),
			intervalSeconds * 1000,
		),
		intervalSeconds,
	});
};

const scheduleAllPolling = async (): Promise<void> => {
	const servers = await loadServers();
	const knownIds = new Set(servers.map((server) => server.id));
	for (const serverId of [...pollingTimers.keys()]) {
		if (!knownIds.has(serverId)) stopServerPolling(serverId);
	}
	for (const server of servers) scheduleServerPolling(server);
	await browser.alarms.create(POLL_ALARM_NAME, {
		periodInMinutes: POLL_RECOVERY_ALARM_PERIOD_MINUTES,
	});
};

const runScheduledSync = async (serverId: string): Promise<void> => {
	if (syncInFlight.has(serverId)) return;
	const server = (await loadServers()).find(
		(candidate) => candidate.id === serverId,
	);
	if (!server) return;
	syncInFlight.add(serverId);
	try {
		await syncServer(server);
	} finally {
		syncInFlight.delete(serverId);
	}
};

const findServer = async (
	serverId: string,
): Promise<ServerConfig | undefined> =>
	(await loadServers()).find((server) => server.id === serverId);

// Guards every in-flight server operation the same way the pre-multi-server
// generation counter did: if the stored server entry changed or vanished
// (re-added, reconfigured, removed), the stale operation must not write state.
const isActiveServerConnection = async (
	server: ServerConfig,
): Promise<boolean> => {
	const stored = await findServer(server.id);
	return Boolean(
		stored &&
			stored.baseUrl === server.baseUrl &&
			stored.token === server.token,
	);
};

const loadMessages = async (
	serverId: string,
	applicationId?: number,
): Promise<BackgroundResponse> => {
	const server = await findServer(serverId);
	if (!server) {
		return { ok: false, error: "Unknown server" };
	}

	try {
		const messages = await fetchAllMessages(server, applicationId);
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
	serverId: string,
	messageId: number,
): Promise<BackgroundResponse> => {
	const server = await findServer(serverId);
	if (!server) {
		return { ok: false, error: "Unknown server" };
	}

	try {
		const response = await request(server, `/message/${messageId}`, {
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
		if (!(await isActiveServerConnection(server))) return loadState();
		const previous = await loadState();
		const slice = previous.servers[serverId];
		if (!slice) return previous;
		const next = withServerSlice(previous, serverId, {
			...slice,
			recentMessages: slice.recentMessages.filter(
				(message) => message.id !== messageId,
			),
		});
		await saveState(next);
		return next;
	});
	return { ok: true, state };
};

const deleteAllMessages = async (
	serverId: string,
	applicationId?: number,
): Promise<BackgroundResponse> => {
	const server = await findServer(serverId);
	if (!server) {
		return { ok: false, error: "Unknown server" };
	}

	const path =
		applicationId === undefined
			? "/message"
			: `/application/${applicationId}/message`;
	try {
		const response = await request(server, path, { method: "DELETE" });
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
		if (!(await isActiveServerConnection(server))) return loadState();
		const previous = await loadState();
		const slice = previous.servers[serverId];
		if (!slice) return previous;
		const next = withServerSlice(previous, serverId, {
			...slice,
			recentMessages:
				applicationId === undefined
					? []
					: slice.recentMessages.filter(
							(message) => message.appid !== applicationId,
						),
			unreadCount: 0,
		});
		await saveState(next);
		return next;
	});
	await updateBadge(state);
	return { ok: true, state };
};

const processIncomingMessages = (
	server: ServerConfig,
	incoming: GotifyMessage[],
): Promise<RuntimeState> => {
	return runMessageStateOperation(async () => {
		if (!(await isActiveServerConnection(server))) return loadState();
		const activeServer = (await findServer(server.id)) ?? server;
		const previous = await loadState();
		const previousSlice =
			previous.servers[server.id] ?? createInitialServerState();
		const cursor = getProcessingCursor(previousSlice) ?? 0;
		const newMessages = deduplicateAndSortMessages(incoming).filter(
			(message) => message.id > cursor,
		);
		const nextCursor = Math.max(
			cursor,
			...incoming.map((message) => message.id),
		);
		let applications = previousSlice.applications;
		if (!applications) {
			try {
				applications = await fetchApplications(activeServer);
			} catch {
				// Retry on a later sync instead of caching a transient failure.
			}
		}
		if (!(await isActiveServerConnection(server))) return loadState();
		const notificationSettings = {
			...DEFAULT_NOTIFICATION_SETTINGS,
			...activeServer.notificationSettings,
			disabledApplicationIds:
				activeServer.notificationSettings?.disabledApplicationIds ?? [],
		};
		const merged = normalizeMessagePreview(
			[...incoming, ...previousSlice.recentMessages],
			MAX_RECENT_MESSAGES,
		);
		const nextSlice: ServerRuntimeState = {
			...previousSlice,
			status: "connected",
			error: undefined,
			notificationsInitialized: true,
			lastSyncAt: Date.now(),
			lastProcessedMessageId: nextCursor,
			recentMessages: merged,
			applications,
			config: {
				baseUrl: activeServer.baseUrl,
				authMode: activeServer.authMode,
				hasToken: Boolean(activeServer.token),
				pollIntervalSeconds:
					activeServer.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
				notificationSettings,
			},
		};

		// Persist the cursor before displaying notifications. A suspended worker
		// can then never replay an already processed message.
		let nextState = withServerSlice(previous, server.id, nextSlice);
		await saveState(nextState);
		if (!(await isActiveServerConnection(server))) return loadState();
		const messagesToNotify = newMessages
			.filter((message) => canNotifyMessage(message, notificationSettings))
			.sort((a, b) => a.id - b.id);
		if (messagesToNotify.length === 0) return nextState;

		const uiVisible = await isUiVisible();
		const unreadCount = uiVisible
			? 0
			: (previousSlice.unreadCount ?? 0) + messagesToNotify.length;
		nextState = withServerSlice(nextState, server.id, {
			...nextSlice,
			unreadCount,
		});
		await saveState(nextState);
		if (!(await isActiveServerConnection(server))) return loadState();
		await updateBadge(nextState);

		try {
			const serverCount = (await loadServers()).length;
			const notificationIds = await notifyMessages(
				messagesToNotify,
				applications ?? {},
				{
					serverId: server.id,
					serverLabel:
						serverCount > 1 ? serverHostLabel(activeServer.baseUrl) : undefined,
				},
			);
			if (!(await isActiveServerConnection(server))) {
				await Promise.all(
					notificationIds.map((id) => browser.notifications.clear(id)),
				);
				return loadState();
			}
		} catch {
			// Cursor persistence is more important than replaying a failed native
			// notification on every subsequent sync.
		}
		return nextState;
	});
};

const syncServer = async (server: ServerConfig): Promise<RuntimeState> => {
	try {
		if (!(await isActiveServerConnection(server))) return loadState();
		const previous = await loadState();
		const slice = previous.servers[server.id] ?? createInitialServerState();
		let cursor = getProcessingCursor(slice);
		if (cursor === undefined) {
			cursor = await getLatestMessageId(server);
			if (!(await isActiveServerConnection(server))) return loadState();
			return publishServerState(server.id, {
				status: "connected",
				error: undefined,
				lastSyncAt: Date.now(),
				lastProcessedMessageId: cursor,
				notificationBaselineId: cursor,
				notificationsInitialized: true,
			});
		}
		const incoming = await fetchMessagesAfter(server, cursor);
		if (!(await isActiveServerConnection(server))) return loadState();
		return processIncomingMessages(server, incoming);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown sync error";
		if (!(await isActiveServerConnection(server))) return loadState();
		const previous = await loadState();
		const slice = previous.servers[server.id] ?? createInitialServerState();
		return publishServerState(server.id, {
			status: slice.status === "logged_out" ? "logged_out" : "error",
			error: message,
		});
	}
};

const addServer = (payload: LoginPayload): Promise<BackgroundResponse> => {
	return runLifecycle(async () => {
		await messageProcessingQueue;
		const baseUrl = normalizeBaseUrl(payload.baseUrl);
		const token = payload.token.trim();

		if (!baseUrl || !token) {
			return {
				ok: false,
				error: "Gotify URL and client token are required",
			};
		}

		const candidate: ServerConfig = {
			id: createServerId(),
			baseUrl,
			authMode: "token",
			token,
			notificationSettings: {
				...DEFAULT_NOTIFICATION_SETTINGS,
				disabledApplicationIds: [],
			},
		};

		try {
			const user = await validateClientToken(candidate);
			const notificationBaselineId = await getLatestMessageId(candidate);

			// Network rules go in before the server becomes visible so the
			// first sync can already issue cross-origin deletes.
			const servers = await loadServers();
			const nextServers = [...servers, candidate];
			await configureOriginBypass(nextServers);
			await saveServers(nextServers);

			const previous = await loadState();
			const connectingSlice =
				previous.servers[candidate.id] ?? createInitialServerState();
			const state: RuntimeState = {
				...previous,
				serverOrder: [...previous.serverOrder, candidate.id],
				servers: {
					...previous.servers,
					[candidate.id]: {
						...connectingSlice,
						status: "connected",
						error: undefined,
						user,
						config: {
							baseUrl: candidate.baseUrl,
							authMode: candidate.authMode,
							hasToken: Boolean(candidate.token),
						},
						recentMessages: [],
						lastProcessedMessageId: notificationBaselineId,
						notificationBaselineId,
						notificationsInitialized: false,
						lastSyncAt: Date.now(),
					},
				},
			};
			await saveState(state);

			scheduleServerPolling(candidate);
			const synced = await syncServer(candidate);
			return { ok: true, state: synced, serverId: candidate.id };
		} catch (error) {
			const message =
				error instanceof Error ? error.message : "Adding server failed";
			// Drop any slice the attempt created so a failed add leaves no trace.
			await runMessageStateOperation(async () => {
				const cleaned = removeServerFromState(await loadState(), candidate.id);
				await saveState(cleaned);
			});
			return { ok: false, error: message };
		}
	});
};

const removeServer = (serverId: string): Promise<BackgroundResponse> => {
	return runLifecycle(async () => {
		await messageProcessingQueue;
		stopServerPolling(serverId);
		const servers = await loadServers();
		const nextServers = servers.filter((server) => server.id !== serverId);
		await saveServers(nextServers);
		await configureOriginBypass(nextServers);

		const state = removeServerFromState(await loadState(), serverId);
		await saveState(state);
		await updateBadge(state);
		return { ok: true, state };
	});
};

const getStateResponse = async (): Promise<BackgroundResponse> => {
	const state = await loadState();
	return { ok: true, state };
};

const updateSettings = async (
	serverId: string,
	pollIntervalSeconds: number,
	notificationSettings?: NotificationSettings,
): Promise<BackgroundResponse> => {
	const servers = await loadServers();
	const server = servers.find((candidate) => candidate.id === serverId);
	if (!server) {
		return { ok: false, error: "Unknown server" };
	}

	const normalizedInterval = normalizePollInterval(pollIntervalSeconds);
	const updatedServer: ServerConfig = {
		...server,
		pollIntervalSeconds: normalizedInterval,
	};
	if (notificationSettings) {
		updatedServer.notificationSettings = {
			...DEFAULT_NOTIFICATION_SETTINGS,
			...notificationSettings,
			disabledApplicationIds: notificationSettings.disabledApplicationIds,
		};
	}
	await saveServers(
		servers.map((candidate) =>
			candidate.id === server.id ? updatedServer : candidate,
		),
	);
	scheduleServerPolling(updatedServer);
	const state = await publishServerState(server.id, {
		config: {
			baseUrl: updatedServer.baseUrl,
			authMode: updatedServer.authMode,
			hasToken: Boolean(updatedServer.token),
			pollIntervalSeconds: normalizedInterval,
			notificationSettings: updatedServer.notificationSettings,
		},
	});
	return { ok: true, state };
};

const handleMessage = async (
	request: BackgroundRequest,
): Promise<BackgroundResponse> => {
	switch (request.type) {
		case "gotify/add-server":
			return addServer(request.payload);
		case "gotify/remove-server":
			return removeServer(request.serverId);
		case "gotify/state":
			return getStateResponse();
		case "gotify/sync": {
			const servers = await loadServers();
			await Promise.all(servers.map((server) => runScheduledSync(server.id)));
			return { ok: true, state: await loadState() };
		}
		case "gotify/mark-ui-visible":
			return { ok: true, state: await markUiVisible() };
		case "gotify/load-messages":
			return loadMessages(request.serverId, request.applicationId);
		case "gotify/delete-message":
			return deleteMessage(request.serverId, request.messageId);
		case "gotify/delete-all-messages":
			return deleteAllMessages(request.serverId, request.applicationId);
		case "gotify/update-settings":
			return updateSettings(
				request.serverId,
				request.pollIntervalSeconds,
				request.notificationSettings,
			);
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
	const state = await runMessageStateOperation(async () => {
		const previous = await loadState();
		const servers = Object.fromEntries(
			Object.entries(previous.servers).map(([serverId, slice]) => [
				serverId,
				{ ...slice, unreadCount: 0 },
			]),
		);
		const next: RuntimeState = {
			...previous,
			servers,
			unreadCount: 0,
		};
		await saveState(next);
		return next;
	});
	await updateBadge(state);
	return state;
};

const openUi = async (): Promise<void> => {
	await markUiVisible();
	await openUiTab();
};

const UPDATE_CHECK_STORAGE_KEY = "gotify.updateCheckedAt";
const MIN_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

// Guarded by a stored timestamp (not just the alarm) because this also runs
// on every service worker wake-up, which can happen far more often than the
// alarm fires and would otherwise burn through GitHub's rate limit.
const runUpdateCheck = async (): Promise<void> => {
	const stored = await browser.storage.local.get(UPDATE_CHECK_STORAGE_KEY);
	const lastCheckedAt = stored[UPDATE_CHECK_STORAGE_KEY] as number | undefined;
	if (
		lastCheckedAt &&
		Date.now() - lastCheckedAt < MIN_UPDATE_CHECK_INTERVAL_MS
	) {
		return;
	}

	try {
		const updateInfo = await checkForUpdate();
		await runMessageStateOperation(async () => {
			const state = await loadState();
			await saveState({ ...state, updateInfo });
		});
	} catch {
		// Transient GitHub API failures (rate limit, offline) just retry on the
		// next check; no need to surface these as a user-facing error.
	} finally {
		await browser.storage.local.set({ [UPDATE_CHECK_STORAGE_KEY]: Date.now() });
	}
};

let initializationPromise: Promise<void> | undefined;
const initializeConnection = (): Promise<void> => {
	if (initializationPromise) return initializationPromise;
	initializationPromise = runLifecycle(async () => {
		await migrateSingleServerStorage();
		const servers = await loadServers();
		await configureOriginBypass(servers);
		await scheduleAllPolling();
		await Promise.all(servers.map((server) => syncServer(server)));
	});
	return initializationPromise;
};

browser.runtime.onInstalled.addListener(() => void initializeConnection());
browser.runtime.onStartup.addListener(() => void initializeConnection());

browser.alarms.onAlarm.addListener(async (alarm: { name: string }) => {
	if (alarm.name === UPDATE_CHECK_ALARM_NAME) {
		await runUpdateCheck();
		return;
	}
	if (alarm.name !== POLL_ALARM_NAME) {
		return;
	}
	// An empty timer map means the worker was suspended and just woke up:
	// recreate the per-server timers and catch up once. While the worker is
	// alive the intervals drive syncing, so the alarm stays a no-op.
	const servers = await loadServers();
	const recovered = pollingTimers.size === 0 && servers.length > 0;
	await scheduleAllPolling();
	if (recovered) {
		await Promise.all(servers.map((server) => runScheduledSync(server.id)));
	}
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
	await openUi();
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
void runUpdateCheck();
void browser.alarms.create(UPDATE_CHECK_ALARM_NAME, {
	periodInMinutes: UPDATE_CHECK_INTERVAL_MINUTES,
});
