import type {
	GotifyApplication,
	GotifyMessage,
	NotificationSettings,
} from "../shared/types";

type ActionApi = {
	setBadgeText: (details: { text: string }) => Promise<void>;
	setBadgeBackgroundColor: (details: { color: string }) => Promise<void>;
};

const browserAction =
	(
		browser as unknown as {
			action?: ActionApi;
			browserAction: ActionApi;
		}
	).action ??
	(browser as unknown as { browserAction: ActionApi }).browserAction;

const parseTimeOfDay = (value: string): number | undefined => {
	const match = /^(\d{2}):(\d{2})$/.exec(value);
	if (!match) return undefined;
	const hours = Number(match[1]);
	const minutes = Number(match[2]);
	if (hours > 23 || minutes > 59) return undefined;
	return hours * 60 + minutes;
};

const isQuietHours = (settings: NotificationSettings): boolean => {
	if (!settings.quietHoursEnabled) return false;
	const start = parseTimeOfDay(settings.quietHoursStart);
	const end = parseTimeOfDay(settings.quietHoursEnd);
	if (start === undefined || end === undefined || start === end) return false;
	const now = new Date();
	const current = now.getHours() * 60 + now.getMinutes();
	return start < end
		? current >= start && current < end
		: current >= start || current < end;
};

export const canNotifyMessage = (
	message: GotifyMessage,
	settings: NotificationSettings,
): boolean =>
	!settings.disabledApplicationIds.includes(message.appid) &&
	!isQuietHours(settings);

const findHttpUrl = (value: unknown): string | undefined => {
	if (!value || typeof value !== "object") return undefined;
	for (const [key, nestedValue] of Object.entries(
		value as Record<string, unknown>,
	)) {
		if (
			["url", "href", "link"].includes(key.toLowerCase()) &&
			typeof nestedValue === "string"
		) {
			try {
				const url = new URL(nestedValue);
				if (url.protocol === "http:" || url.protocol === "https:") {
					return nestedValue;
				}
			} catch {
				// Continue searching nested extras.
			}
		}
		const nestedUrl = findHttpUrl(nestedValue);
		if (nestedUrl) return nestedUrl;
	}
	return undefined;
};

export const notifyMessages = async (
	messages: GotifyMessage[],
	applications: Record<string, GotifyApplication>,
): Promise<{
	notificationIds: string[];
	targets: Record<string, string>;
}> => {
	const notificationTargets: Record<string, string> = {};
	const notificationIds: string[] = [];
	if (messages.length === 1) {
		const [message] = messages;
		const notificationId = `gotify-${message.id}`;
		notificationIds.push(notificationId);
		const applicationName = applications[String(message.appid)]?.name;
		await browser.notifications.create(notificationId, {
			type: "basic",
			iconUrl: browser.runtime.getURL("images/icon.png"),
			title: [applicationName, message.title?.trim() || "Gotify Notification"]
				.filter(Boolean)
				.join(" | "),
			message: message.message?.trim() || "(empty message)",
			priority: Math.max(Math.min(message.priority ?? 0, 2), -2),
			requireInteraction: (message.priority ?? 0) >= 8,
		});
		const targetUrl = findHttpUrl(message.extras);
		if (targetUrl) notificationTargets[notificationId] = targetUrl;
	} else if (messages.length > 1) {
		const highestPriority = Math.max(
			...messages.map((message) => message.priority ?? 0),
		);
		const lastMessage = messages[messages.length - 1];
		const notificationId = `gotify-batch-${lastMessage.id}`;
		notificationIds.push(notificationId);
		await browser.notifications.create(notificationId, {
			type: "basic",
			iconUrl: browser.runtime.getURL("images/icon.png"),
			title: "Gotify Notifications",
			message: `${messages.length} new notifications`,
			priority: Math.max(Math.min(highestPriority, 2), -2),
			requireInteraction: highestPriority >= 8,
		});
		const targetUrl = findHttpUrl(lastMessage.extras);
		if (targetUrl) notificationTargets[notificationId] = targetUrl;
	}

	if (messages.length > 0) {
		await browserAction.setBadgeText({ text: String(messages.length) });
		await browserAction.setBadgeBackgroundColor({ color: "#1976d2" });
	}
	return { notificationIds, targets: notificationTargets };
};
