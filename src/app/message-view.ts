import type { GotifyApplication, GotifyMessage } from "../shared/types";

export type SortOrder = "newest" | "oldest" | "priority";

export interface MessageViewFilter {
	/** Case-insensitive match against title, body, and application name. */
	searchText?: string;
}

export const isFilterActive = (filter: MessageViewFilter): boolean =>
	Boolean(filter.searchText?.trim());

export const filterMessages = (
	messages: GotifyMessage[],
	applications: Record<string, GotifyApplication> | undefined,
	filter: MessageViewFilter,
): GotifyMessage[] => {
	if (!isFilterActive(filter)) return messages;
	const search = filter.searchText?.trim().toLowerCase();
	return messages.filter((message) => {
		const applicationName =
			applications?.[String(message.appid)]?.name ?? `App ${message.appid}`;
		return (
			message.title.toLowerCase().includes(search) ||
			message.message.toLowerCase().includes(search) ||
			applicationName.toLowerCase().includes(search)
		);
	});
};

export const sortMessages = (
	messages: GotifyMessage[],
	sortOrder: SortOrder,
): GotifyMessage[] => {
	const sorted = [...messages];
	switch (sortOrder) {
		case "oldest":
			return sorted.sort((a, b) => a.id - b.id);
		case "priority":
			return sorted.sort((a, b) => b.priority - a.priority || b.id - a.id);
		default:
			return sorted.sort((a, b) => b.id - a.id);
	}
};
