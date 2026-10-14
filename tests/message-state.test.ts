import { expect, test } from "bun:test";
import {
	deduplicateAndSortMessages,
	getProcessingCursor,
} from "../src/background/message-state";
import type { GotifyMessage, ServerRuntimeState } from "../src/shared/types";

const message = (id: number): GotifyMessage => ({
	id,
	appid: 1,
	message: String(id),
	title: String(id),
	priority: 0,
	date: "2026-08-09T00:00:00Z",
});

test("migrates legacy state using the highest known message id", () => {
	const legacyState: ServerRuntimeState = {
		status: "connected",
		notificationBaselineId: 100,
		recentMessages: [message(140), message(139)],
	};

	expect(getProcessingCursor(legacyState)).toBe(140);
});

test("prefers the highest cursor across old and new state fields", () => {
	const state: ServerRuntimeState = {
		status: "connected",
		lastProcessedMessageId: 150,
		lastNotifiedMessageId: 145,
		notificationBaselineId: 100,
		recentMessages: [message(149)],
	};

	expect(getProcessingCursor(state)).toBe(150);
});

test("deduplicates messages and keeps newest first", () => {
	expect(
		deduplicateAndSortMessages([message(2), message(3), message(2)]).map(
			({ id }) => id,
		),
	).toEqual([3, 2]);
});

test("cursor-less legacy state rebaselines instead of using old paging state", () => {
	const legacyState = {
		status: "connected",
		lastMessageSince: 25,
		recentMessages: [],
	} as unknown as ServerRuntimeState;

	expect(getProcessingCursor(legacyState)).toBeUndefined();
});
