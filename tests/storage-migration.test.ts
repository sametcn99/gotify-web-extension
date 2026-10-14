import { beforeEach, expect, test } from "bun:test";

const storageData = new Map<string, unknown>();

beforeEach(() => {
	storageData.clear();
});

Object.assign(globalThis, {
	browser: {
		storage: {
			local: {
				get: async (key: string) => ({ [key]: storageData.get(key) }),
				set: async (items: Record<string, unknown>) => {
					for (const [key, value] of Object.entries(items)) {
						storageData.set(key, value);
					}
				},
				remove: async (keys: string | string[]) => {
					for (const key of Array.isArray(keys) ? keys : [keys]) {
						storageData.delete(key);
					}
				},
			},
		},
	},
});

const {
	loadServers,
	loadState,
	migrateSingleServerStorage,
	removeServerFromState,
	sumUnreadCount,
} = await import("../src/shared/storage");

import type { RuntimeState, ServerRuntimeState } from "../src/shared/types";

const legacyConfig = {
	baseUrl: "https://gotify.example.test",
	authMode: "token",
	token: "client-token",
} as const;

const legacyState = {
	status: "connected",
	lastProcessedMessageId: 5,
	notificationBaselineId: 4,
	recentMessages: [
		{
			id: 5,
			appid: 1,
			message: "hello",
			title: "hi",
			priority: 4,
			date: "2026-08-09T00:00:00Z",
		},
	],
	unreadCount: 2,
	updateInfo: {
		currentVersion: "1.2.0",
		latestVersion: "1.3.0",
		releaseUrl: "https://example.test/release",
	},
} as const;

test("migrates single-server config and state into the multi-server shape", async () => {
	storageData.set("gotify.config", legacyConfig);
	storageData.set("gotify.state", legacyState);

	await migrateSingleServerStorage();

	const servers = await loadServers();
	expect(servers.length).toBe(1);
	expect(servers[0].baseUrl).toBe(legacyConfig.baseUrl);
	expect(servers[0].token).toBe(legacyConfig.token);
	expect(servers[0].pollIntervalSeconds).toBe(60);
	expect(servers[0].notificationSettings?.disabledApplicationIds).toEqual([]);
	expect(servers[0].id).toBeTruthy();

	const state = await loadState();
	expect(state.serverOrder).toEqual([servers[0].id]);
	const slice = state.servers[servers[0].id];
	expect(slice.lastProcessedMessageId).toBe(5);
	expect(slice.recentMessages.length).toBe(1);
	expect(slice.unreadCount).toBe(2);
	expect(state.unreadCount).toBe(2);
	expect(state.updateInfo?.latestVersion).toBe("1.3.0");
	expect(storageData.has("gotify.config")).toBe(false);
});

test("migration is idempotent", async () => {
	storageData.set("gotify.config", legacyConfig);
	storageData.set("gotify.state", legacyState);

	await migrateSingleServerStorage();
	const afterFirst = await loadServers();
	await migrateSingleServerStorage();
	const afterSecond = await loadServers();

	expect(afterSecond).toEqual(afterFirst);
});

test("empty storage migrates to an empty multi-server state", async () => {
	await migrateSingleServerStorage();

	expect(await loadServers()).toEqual([]);
	const state = await loadState();
	expect(state.serverOrder).toEqual([]);
	expect(state.servers).toEqual({});
});

test("legacy flat state is wrapped lazily around the stored server", async () => {
	storageData.set("gotify.servers", [
		{
			id: "server-1",
			baseUrl: "https://gotify.example.test",
			authMode: "token",
			token: "client-token",
		},
	]);
	storageData.set("gotify.state", {
		...legacyState,
		updateInfo: undefined,
	});

	const state = await loadState();
	expect(state.serverOrder).toEqual(["server-1"]);
	expect(state.servers["server-1"].lastProcessedMessageId).toBe(5);
	expect(state.unreadCount).toBe(2);
});

test("removing a server drops its slice and recomputes the badge total", () => {
	const servers: Record<string, ServerRuntimeState> = {
		one: {
			status: "connected",
			recentMessages: [],
			unreadCount: 3,
		},
		two: {
			status: "connected",
			recentMessages: [],
			unreadCount: 4,
		},
	};
	const state: RuntimeState = {
		serverOrder: ["one", "two"],
		servers,
		unreadCount: 7,
	};

	const next = removeServerFromState(state, "one");

	expect(next.serverOrder).toEqual(["two"]);
	expect(Object.keys(next.servers)).toEqual(["two"]);
	expect(next.unreadCount).toBe(4);
	expect(sumUnreadCount(next.servers)).toBe(4);
});
