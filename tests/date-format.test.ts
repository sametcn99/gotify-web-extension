import { expect, test } from "bun:test";
import type { DateFormatSetting } from "../src/app/utils";
import { DEFAULT_DATE_FORMAT, formatMessageDate } from "../src/app/utils";

const localDate = new Date(2026, 0, 2, 14, 5, 9); // Jan 2 2026, 14:05:09 local
const iso = localDate.toISOString();

const setting = (overrides: Partial<DateFormatSetting>): DateFormatSetting => ({
	...DEFAULT_DATE_FORMAT,
	mode: "absolute",
	...overrides,
});

test("relative mode falls back to the relative format", () => {
	expect(formatMessageDate(iso, DEFAULT_DATE_FORMAT)).toMatch(/ago$/);
	expect(formatMessageDate("not-a-date", DEFAULT_DATE_FORMAT)).toMatch(/ago$/);
});

test("absolute mode renders day.month.year hour:minute by default", () => {
	expect(formatMessageDate(iso, setting())).toBe("02.01.2026 14:05");
});

test("individual date and time components toggle independently", () => {
	expect(formatMessageDate(iso, setting({ showYear: false }))).toBe(
		"02.01 14:05",
	);
	expect(
		formatMessageDate(iso, setting({ showMonth: false, showDay: false })),
	).toBe("2026 14:05");
	expect(formatMessageDate(iso, setting({ showMinute: false }))).toBe(
		"02.01.2026 14",
	);
	expect(formatMessageDate(iso, setting({ showSecond: true }))).toBe(
		"02.01.2026 14:05:09",
	);
	expect(formatMessageDate(iso, setting({ showHour: false }))).toBe(
		"02.01.2026",
	);
});

test("12-hour notation adds an AM/PM suffix and rolls midnight and noon", () => {
	expect(formatMessageDate(iso, setting({ hour12: true }))).toBe(
		"02.01.2026 02:05 PM",
	);
	expect(
		formatMessageDate(
			new Date(2026, 5, 3, 0, 30).toISOString(),
			setting({ hour12: true }),
		),
	).toBe("03.06.2026 12:30 AM");
});

test("no components selected falls back to relative time", () => {
	const empty = setting({
		showYear: false,
		showMonth: false,
		showDay: false,
		showHour: false,
		showMinute: false,
		showSecond: false,
	});
	expect(formatMessageDate(iso, empty)).toMatch(/ago$/);
});
