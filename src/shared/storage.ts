import type { GotifyConfig, RuntimeState } from "./types";

const STORAGE_KEYS = {
	config: "gotify.config",
	state: "gotify.state",
} as const;

export const DEFAULT_POLL_INTERVAL_SECONDS = 60;
export const DEFAULT_NOTIFICATION_SETTINGS = {
	quietHoursEnabled: false,
	quietHoursStart: "22:00",
	quietHoursEnd: "07:00",
	disabledApplicationIds: [],
} as const;

const initialState: RuntimeState = {
	status: "logged_out",
	notificationsInitialized: false,
	recentMessages: [],
};

const getLocalStorage = async <T>(key: string): Promise<T | undefined> => {
	const data = await browser.storage.local.get(key);
	return data[key] as T | undefined;
};

const setLocalStorage = async <T>(key: string, value: T): Promise<void> => {
	await browser.storage.local.set({ [key]: value });
};

export const loadConfig = async (): Promise<GotifyConfig | null> => {
	const config = await getLocalStorage<GotifyConfig>(STORAGE_KEYS.config);
	return config
		? {
				...config,
				pollIntervalSeconds:
					config.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS,
				notificationSettings: {
					...DEFAULT_NOTIFICATION_SETTINGS,
					...config.notificationSettings,
					disabledApplicationIds:
						config.notificationSettings?.disabledApplicationIds ?? [],
				},
			}
		: null;
};

export const saveConfig = async (config: GotifyConfig): Promise<void> => {
	await setLocalStorage(STORAGE_KEYS.config, config);
};

export const clearConfig = async (): Promise<void> => {
	await browser.storage.local.remove(STORAGE_KEYS.config);
};

export const loadState = async (): Promise<RuntimeState> => {
	return (
		(await getLocalStorage<RuntimeState>(STORAGE_KEYS.state)) ?? initialState
	);
};

export const saveState = async (state: RuntimeState): Promise<void> => {
	await setLocalStorage(STORAGE_KEYS.state, state);
};

export const resetState = async (): Promise<RuntimeState> => {
	await saveState(initialState);
	return initialState;
};
