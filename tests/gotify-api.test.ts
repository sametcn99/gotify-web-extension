import { afterEach, expect, test } from "bun:test";
import type { GotifyConfig, GotifyMessage } from "../src/shared/types";

Object.assign(globalThis, {
	browser: {
		runtime: {
			id: "test-extension-id",
			getManifest: () => ({ manifest_version: 3 }),
			getURL: () => "chrome-extension://test-extension-id/",
		},
	},
});

const { fetchMessagesAfter } = await import("../src/background/gotify-api");

const config: GotifyConfig = {
	baseUrl: "https://gotify.example.test",
	authMode: "token",
	token: "client-token",
};

const message = (id: number): GotifyMessage => ({
	id,
	appid: 1,
	message: `message ${id}`,
	title: `title ${id}`,
	priority: 5,
	date: "2026-08-09T00:00:00Z",
});

const response = (ids: number[], next?: string) =>
	new Response(
		JSON.stringify({
			paging: { size: ids.length, limit: 200, next },
			messages: ids.map(message),
		}),
		{ status: 200, headers: { "Content-Type": "application/json" } },
	);

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

test("stops when the current page reaches the processed cursor", async () => {
	const requestedUrls: string[] = [];
	globalThis.fetch = async (input) => {
		requestedUrls.push(String(input));
		return response([105, 104, 103], "/message?limit=200&since=103");
	};

	const messages = await fetchMessagesAfter(config, 103);

	expect(messages.map(({ id }) => id)).toEqual([105, 104]);
	expect(requestedUrls).toHaveLength(1);
});

test("paginates until all messages newer than the cursor are collected", async () => {
	const pages = [
		response(
			Array.from({ length: 200 }, (_, index) => 500 - index),
			"/message?limit=200&since=301",
		),
		response(
			Array.from({ length: 200 }, (_, index) => 300 - index),
			"/message?limit=200&since=101",
		),
		response([100, 99]),
	];
	let requestCount = 0;
	globalThis.fetch = async () => pages[requestCount++];

	const messages = await fetchMessagesAfter(config, 100);

	expect(messages).toHaveLength(400);
	expect(messages[0].id).toBe(500);
	expect(messages.at(-1)?.id).toBe(101);
	expect(requestCount).toBe(3);
});

test("returns no messages when the server has nothing newer", async () => {
	globalThis.fetch = async () => response([100, 99]);

	const messages = await fetchMessagesAfter(config, 100);

	expect(messages).toEqual([]);
});

test("does not truncate reconciliation after fifty pages", async () => {
	let requestCount = 0;
	globalThis.fetch = async () => {
		requestCount += 1;
		const id = 61 - requestCount;
		return response(
			[id],
			id > 1 ? `/message?limit=200&since=${id}` : undefined,
		);
	};

	const messages = await fetchMessagesAfter(config, 0);

	expect(messages).toHaveLength(60);
	expect(requestCount).toBe(60);
});

test("rejects repeated paging URLs instead of looping forever", async () => {
	globalThis.fetch = async () =>
		response([200], "/message?limit=200&since=200");

	expect(fetchMessagesAfter(config, 100)).rejects.toThrow(
		"repeated paging URL",
	);
});
