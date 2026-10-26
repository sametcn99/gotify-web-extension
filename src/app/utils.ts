import type { BackgroundRequest, BackgroundResponse } from "../shared/types";

export const priorityColor = (priority: number): string => {
	if (priority > 7) return "#e74c3c";
	if (priority >= 4) return "rgba(230, 126, 34, 0.7)";
	return "transparent";
};

export const formatRelativeTime = (date: string): string => {
	const seconds = Math.max(
		0,
		Math.floor((Date.now() - new Date(date).getTime()) / 1000),
	);
	if (seconds < 60) return `${seconds} seconds ago`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} minutes ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours} hours ago`;
	return `${Math.floor(hours / 24)} days ago`;
};

export interface DateFormatSetting {
	/** "relative" shows "2 hours ago"; "absolute" shows the exact date. */
	mode: "relative" | "absolute";
	showYear: boolean;
	showMonth: boolean;
	showDay: boolean;
	showHour: boolean;
	showMinute: boolean;
	showSecond: boolean;
	hour12: boolean;
}

export const DEFAULT_DATE_FORMAT: DateFormatSetting = {
	mode: "relative",
	showYear: true,
	showMonth: true,
	showDay: true,
	showHour: true,
	showMinute: true,
	showSecond: false,
	hour12: false,
};

const pad = (value: number): string => String(value).padStart(2, "0");

export const formatMessageDate = (
	date: string,
	setting: DateFormatSetting,
): string => {
	if (setting.mode === "relative") return formatRelativeTime(date);
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return formatRelativeTime(date);

	const dateParts: string[] = [];
	if (setting.showDay) dateParts.push(pad(parsed.getDate()));
	if (setting.showMonth) dateParts.push(pad(parsed.getMonth() + 1));
	if (setting.showYear) dateParts.push(String(parsed.getFullYear()));

	let timeText = "";
	// The hour anchors the time block; without it, lone minutes/seconds
	// would render as a meaningless ":05"-style remnant.
	if (setting.showHour) {
		let hours = parsed.getHours();
		let meridiem = "";
		if (setting.hour12) {
			meridiem = hours >= 12 ? "PM" : "AM";
			hours = hours % 12 || 12;
		}
		const timeParts: string[] = [];
		if (setting.showHour) timeParts.push(pad(hours));
		if (setting.showMinute) timeParts.push(pad(parsed.getMinutes()));
		if (setting.showSecond) timeParts.push(pad(parsed.getSeconds()));
		timeText = timeParts.join(":");
		if (meridiem) timeText += ` ${meridiem}`;
	}

	// Nothing selected would render an empty string; fall back to relative.
	const formatted = [dateParts.join("."), timeText].filter(Boolean).join(" ");
	return formatted || formatRelativeTime(date);
};

export const formatExtras = (
	extras: Record<string, unknown> | undefined,
): string => {
	if (!extras || Object.keys(extras).length === 0) return "";
	try {
		return JSON.stringify(extras, null, 2);
	} catch {
		return "Unable to display extras";
	}
};

export const getImageUrl = (
	baseUrl: string,
	imagePath?: string,
): string | undefined => {
	if (!imagePath) return undefined;
	if (imagePath.startsWith("http://") || imagePath.startsWith("https://")) {
		return imagePath;
	}
	const cleanBase = baseUrl.replace(/\/+$/, "");
	const cleanPath = imagePath.replace(/^\/+/, "");
	return `${cleanBase}/${cleanPath}`;
};

export const serverHostname = (baseUrl: string): string => {
	try {
		return new URL(baseUrl).host;
	} catch {
		return baseUrl;
	}
};

export const sendMessage = async (
	message: BackgroundRequest,
): Promise<BackgroundResponse> =>
	(await browser.runtime.sendMessage(message)) as BackgroundResponse;
