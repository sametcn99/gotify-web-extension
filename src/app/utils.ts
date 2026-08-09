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

export const sendMessage = async (
	message: BackgroundRequest,
): Promise<BackgroundResponse> =>
	(await browser.runtime.sendMessage(message)) as BackgroundResponse;
