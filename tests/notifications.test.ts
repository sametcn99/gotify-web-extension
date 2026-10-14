import { beforeEach, expect, test } from "bun:test";

const createdNotifications: Array<{ id: string; options: unknown }> = [];

Object.assign(globalThis, {
	browser: {
		runtime: {
			getURL: (path: string) => `chrome-extension://test-extension-id/${path}`,
		},
		notifications: {
			create: async (id: string, options: unknown) => {
				createdNotifications.push({ id, options });
				return id;
			},
		},
	},
});

const { canNotifyMessage, notifyMessages } = await import(
	"../src/background/notifications"
);

import type { GotifyMessage } from "../src/shared/types";

beforeEach(() => {
	createdNotifications.length = 0;
});

const message = (id: number): GotifyMessage => ({
	id,
	appid: 7,
	message: `body ${id}`,
	title: `title ${id}`,
	priority: 5,
	date: "2026-10-14T00:00:00Z",
});

const applications = { "7": { id: 7, name: "Backup" } };

test("scopes single-message notification ids to the server", async () => {
	const ids = await notifyMessages([message(42)], applications, {
		serverId: "server-a",
	});

	expect(ids).toEqual(["gotify-server-a-42"]);
	expect(createdNotifications.length).toBe(1);
	expect(createdNotifications[0].id).toBe("gotify-server-a-42");
});

test("uses distinct ids per server for the same message id", async () => {
	await notifyMessages([message(42)], applications, { serverId: "server-a" });
	await notifyMessages([message(42)], applications, { serverId: "server-b" });

	expect(createdNotifications.map(({ id }) => id)).toEqual([
		"gotify-server-a-42",
		"gotify-server-b-42",
	]);
});

test("prefixes titles with the server label when provided", async () => {
	await notifyMessages([message(42)], applications, {
		serverId: "server-a",
		serverLabel: "gotify.example.test",
	});

	const options = createdNotifications[0].options as { title: string };
	expect(options.title).toBe("[gotify.example.test] Backup | title 42");
});

test("omits the label prefix for single-server setups", async () => {
	await notifyMessages([message(42)], applications, {
		serverId: "server-a",
	});

	const options = createdNotifications[0].options as { title: string };
	expect(options.title).toBe("Backup | title 42");
});

test("batches multiple messages into one per-server notification", async () => {
	const ids = await notifyMessages(
		[message(1), message(2), message(3)],
		applications,
		{
			serverId: "server-b",
			serverLabel: "gotify.example.test",
		},
	);

	expect(ids).toEqual(["gotify-batch-server-b-3"]);
	const options = createdNotifications[0].options as {
		title: string;
		message: string;
	};
	expect(options.title).toBe("[gotify.example.test] Gotify Notifications");
	expect(options.message).toBe("3 new notifications");
});

test("skips notifications for disabled applications", () => {
	const settings = {
		quietHoursEnabled: false,
		quietHoursStart: "22:00",
		quietHoursEnd: "07:00",
		disabledApplicationIds: [7],
	};

	expect(canNotifyMessage(message(42), settings)).toBe(false);

	expect(
		canNotifyMessage(message(42), { ...settings, disabledApplicationIds: [] }),
	).toBe(true);
});
