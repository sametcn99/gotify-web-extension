import { expect, test } from "bun:test";
import { filterMessages, sortMessages } from "../src/app/message-view";
import type { GotifyApplication, GotifyMessage } from "../src/shared/types";

const applications: Record<string, GotifyApplication> = {
	"1": { id: 1, name: "Backup" },
	"2": { id: 2, name: "CI Bot" },
};

const message = (overrides: Partial<GotifyMessage>): GotifyMessage => ({
	id: 1,
	appid: 1,
	message: "body",
	title: "title",
	priority: 0,
	date: "2026-08-09T00:00:00Z",
	...overrides,
});

test("filter matches title, body, and application name case-insensitively", () => {
	const messages = [
		message({ id: 1, title: "Disk Full" }),
		message({ id: 2, message: "nightly backup finished" }),
		message({ id: 3, appid: 2, title: "unrelated" }),
	];

	expect(
		filterMessages(messages, applications, { searchText: "DISK" }).map(
			(m) => m.id,
		),
	).toEqual([1]);
	// "backup" matches both the body of #2 and the application name of #1.
	expect(
		filterMessages(messages, applications, { searchText: "backup" }).map(
			(m) => m.id,
		),
	).toEqual([1, 2]);
	expect(
		filterMessages(messages, applications, { searchText: "nightly" }).map(
			(m) => m.id,
		),
	).toEqual([2]);
	expect(
		filterMessages(messages, applications, { searchText: "ci bot" }).map(
			(m) => m.id,
		),
	).toEqual([3]);
});

test("filter with no meaningful input returns the original list", () => {
	const messages = [message({ id: 1 })];
	expect(filterMessages(messages, applications, { searchText: "   " })).toBe(
		messages,
	);
	expect(filterMessages(messages, applications, {})).toBe(messages);
});

test("sort orders: newest, oldest, priority with newest tie-break", () => {
	const messages = [
		message({ id: 3, priority: 5 }),
		message({ id: 1, priority: 9 }),
		message({ id: 2, priority: 9 }),
	];

	expect(sortMessages(messages, "newest").map((m) => m.id)).toEqual([3, 2, 1]);
	expect(sortMessages(messages, "oldest").map((m) => m.id)).toEqual([1, 2, 3]);
	expect(sortMessages(messages, "priority").map((m) => m.id)).toEqual([
		2, 1, 3,
	]);
});

test("sort does not mutate the input array", () => {
	const messages = [message({ id: 1 }), message({ id: 2 })];
	sortMessages(messages, "oldest");
	expect(messages.map((m) => m.id)).toEqual([1, 2]);
});
