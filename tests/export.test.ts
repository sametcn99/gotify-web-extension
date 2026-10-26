import { expect, test } from "bun:test";
import {
	applicationNameFor,
	buildExportFilename,
	messagesToCsv,
	messagesToJson,
} from "../src/app/export";
import type { GotifyApplication, GotifyMessage } from "../src/shared/types";

const applications: Record<string, GotifyApplication> = {
	"1": { id: 1, name: "Backup" },
	"2": { id: 2, name: "CI" },
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

test("applicationNameFor falls back when the app is unknown", () => {
	expect(applicationNameFor(message({ appid: 1 }), applications)).toBe(
		"Backup",
	);
	expect(applicationNameFor(message({ appid: 9 }), applications)).toBe("App 9");
	expect(applicationNameFor(message({ appid: 9 }), undefined)).toBe("App 9");
});

test("csv contains a BOM, header row, and CRLF lines", () => {
	const csv = messagesToCsv([message({ id: 5, title: "hello" })], applications);
	expect(csv.startsWith("\uFEFF")).toBe(true);
	const lines = csv.slice(1).split("\r\n");
	expect(lines[0]).toBe(
		"id,date,application,app_id,title,priority,message,extras",
	);
	expect(lines[1]).toBe("5,2026-08-09T00:00:00Z,Backup,1,hello,0,body,");
	expect(lines).toHaveLength(2);
});

test("csv escapes quotes, commas, and newlines", () => {
	const tricky = message({
		id: 1,
		title: 'He said "run, now"',
		message: "line1\nline2",
	});
	const csv = messagesToCsv([tricky], applications);
	const cells = csv.slice(1).split("\r\n")[1];
	expect(cells).toContain('"He said ""run, now"""');
	expect(cells).toContain('"line1\nline2"');
});

test("csv omits empty extras but serializes non-empty ones as JSON", () => {
	const withExtras = messagesToCsv(
		[message({ id: 1, extras: { display: { name: "Zed" } } })],
		applications,
	);
	const cells = withExtras.slice(1).split("\r\n")[1];
	expect(cells.endsWith('"{""display"":{""name"":""Zed""}}"')).toBe(true);
});

test("json export wraps messages with metadata and resolved names", () => {
	const json = messagesToJson(
		[message({ id: 7, appid: 2, title: "build ok" })],
		applications,
		{ name: "localhost:8801", url: "http://localhost:8801" },
	);
	const parsed = JSON.parse(json) as {
		format: string;
		version: number;
		exportedAt: string;
		server: { name: string; url: string };
		applications: Array<{ id: number; name: string }>;
		messages: Array<Record<string, unknown>>;
	};

	expect(parsed.format).toBe("gotify-web-extension-export");
	expect(parsed.version).toBe(1);
	expect(parsed.exportedAt).toBeString();
	expect(parsed.server).toEqual({
		name: "localhost:8801",
		url: "http://localhost:8801",
	});
	expect(parsed.applications).toHaveLength(2);
	expect(parsed.messages).toHaveLength(1);
	expect(parsed.messages[0].application).toBe("CI");
	expect(parsed.messages[0].title).toBe("build ok");
});

test("filename includes host, scope, timestamp, and format extension", () => {
	const filename = buildExportFilename(
		"localhost:8801",
		"Backup",
		"csv",
		new Date(2026, 9, 25, 14, 5, 9),
	);
	expect(filename).toBe(
		"gotify-messages-localhost-8801-Backup-20261025-140509.csv",
	);

	const fallback = buildExportFilename(
		"x",
		"weird scope!!",
		"json",
		new Date(2026, 0, 2),
	);
	expect(fallback.endsWith("weird-scope-20260102-000000.json")).toBe(true);

	const emptyScope = buildExportFilename(
		"x",
		"***",
		"json",
		new Date(2026, 0, 2),
	);
	expect(emptyScope.endsWith("-all-20260102-000000.json")).toBe(true);
});
