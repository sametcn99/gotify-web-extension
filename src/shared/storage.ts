import type { RuntimeState, ServerConfig, ServerRuntimeState } from "./types";

const STORAGE_KEYS = {
	servers: "gotify.servers",
	legacyConfig: "gotify.config",
	state: "gotify.state",
} as const;

export const DEFAULT_POLL_INTERVAL_SECONDS = 60;
export const DEFAULT_NOTIFICATION_SETTINGS = {
	quietHoursEnabled: false,
	quietHoursStart: "22:00",
	quietHoursEnd: "07:00",
	disabledApplicationIds: [],
} as const;

export const createInitialServerState = (): ServerRuntimeState => ({
	status: "logged_out",
	notificationsInitialized: false,
	recentMessages: [],
	unreadCount: 0,
});

const initialState: RuntimeState = {
	serverOrder: [],
	servers: {},
	unreadCount: 0,
};

const getLocalStorage = async <T>(key: string): Promise<T | undefined> => {
	const data = await browser.storage.local.get(key);
	return data[key] as T | undefined;
};

const setLocalStorage = async <T>(key: string, value: T): Promise<void> => {
	await browser.storage.local.set({ [key]: value });
};

const normalizeServerConfig = (server: ServerConfig): ServerConfig => ({
	...server,
	pollIntervalSeconds:
		server.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
	notificationSettings: {
		...DEFAULT_NOTIFICATION_SETTINGS,
		...server.notificationSettings,
		disabledApplicationIds:
			server.notificationSettings?.disabledApplicationIds ?? [],
	},
});

export const createServerId = (): string => crypto.randomUUID();

export const loadServers = async (): Promise<ServerConfig[]> => {
	const servers = await getLocalStorage<ServerConfig[]>(STORAGE_KEYS.servers);
	return (servers ?? []).map(normalizeServerConfig);
};

export const saveServers = async (servers: ServerConfig[]): Promise<void> => {
	await setLocalStorage(STORAGE_KEYS.servers, servers);
};

export const sumUnreadCount = (
	servers: Record<string, ServerRuntimeState>,
): number =>
	Object.values(servers).reduce(
		(total, server) => total + (server.unreadCount ?? 0),
		0,
	);

export const loadState = async (): Promise<RuntimeState> => {
	const stored = await getLocalStorage<RuntimeState>(STORAGE_KEYS.state);
	if (!stored) return initialState;
	if (Array.isArray(stored.serverOrder) && stored.servers) return stored;

	// Legacy single-server state: wrap it under the first stored server so
	// older payloads remain usable even before the explicit migration ran.
	const [server] = await loadServers();
	if (!server) return initialState;
	const { serverOrder, servers, updateInfo, unreadCount, ...legacySlice } =
		stored;
	return {
		serverOrder: [server.id],
		servers: {
			[server.id]: {
				...legacySlice,
				unreadCount: unreadCount ?? 0,
			} as ServerRuntimeState,
		},
		unreadCount: unreadCount ?? 0,
		updateInfo,
	};
};

export const saveState = async (state: RuntimeState): Promise<void> => {
	await setLocalStorage(STORAGE_KEYS.state, state);
};

export const removeServerFromState = (
	state: RuntimeState,
	serverId: string,
): RuntimeState => {
	const servers = { ...state.servers };
	delete servers[serverId];
	return {
		...state,
		serverOrder: state.serverOrder.filter((id) => id !== serverId),
		servers,
		unreadCount: sumUnreadCount(servers),
	};
};

export const resetState = async (): Promise<RuntimeState> => {
	await saveState(initialState);
	return initialState;
};

/**
 * Moves the pre-multi-server single-server storage (gotify.config plus the
 * legacy flat gotify.state) into gotify.servers and the per-server state
 * wrapper. Idempotent; runs once from background initialization.
 */
export const migrateSingleServerStorage = async (): Promise<void> => {
	const existing = await getLocalStorage<unknown>(STORAGE_KEYS.servers);
	if (existing) return;

	const legacyConfig = await getLocalStorage<
		Omit<ServerConfig, "id"> & { id?: string }
	>(STORAGE_KEYS.legacyConfig);
	if (!legacyConfig) return;

	const server = normalizeServerConfig({
		...legacyConfig,
		id: legacyConfig.id ?? createServerId(),
	} as ServerConfig);
	await saveServers([server]);

	const legacyState = await getLocalStorage<RuntimeState>(STORAGE_KEYS.state);
	if (legacyState && !legacyState.servers) {
		const { serverOrder, servers, updateInfo, unreadCount, ...slice } =
			legacyState;
		await saveState({
			serverOrder: [server.id],
			servers: {
				[server.id]: {
					...slice,
					unreadCount: unreadCount ?? 0,
				} as ServerRuntimeState,
			},
			unreadCount: unreadCount ?? 0,
			updateInfo,
		});
	}

	await browser.storage.local.remove(STORAGE_KEYS.legacyConfig);
};
