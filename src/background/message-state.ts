import type { GotifyMessage, ServerRuntimeState } from "../shared/types";

export const deduplicateAndSortMessages = (messages: GotifyMessage[]) => {
	const uniqueMessages = new Map<number, GotifyMessage>();
	for (const message of messages) uniqueMessages.set(message.id, message);
	return [...uniqueMessages.values()].sort((a, b) => b.id - a.id);
};

export const normalizeMessagePreview = (
	messages: GotifyMessage[],
	limit: number,
): GotifyMessage[] => deduplicateAndSortMessages(messages).slice(0, limit);

export const getProcessingCursor = (
	state: ServerRuntimeState,
): number | undefined => {
	const candidates = [
		state.lastProcessedMessageId,
		state.lastNotifiedMessageId,
		state.notificationBaselineId,
		...state.recentMessages.map((message) => message.id),
	].filter((value): value is number => value !== undefined);
	return candidates.length > 0 ? Math.max(...candidates) : undefined;
};
