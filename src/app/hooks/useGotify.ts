import { enqueueSnackbar } from "notistack";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	GotifyMessage,
	LoginPayload,
	RuntimeState,
} from "../../shared/types";
import {
	DEFAULT_POLL_INTERVAL_SECONDS,
	DEFAULT_QUIET_HOURS_END,
	DEFAULT_QUIET_HOURS_START,
	initialState,
} from "../constants";
import { sendMessage } from "../utils";

export const useGotify = () => {
	const [state, setState] = useState<RuntimeState>(initialState);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [messagesLoading, setMessagesLoading] = useState(false);
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");
	const [messages, setMessages] = useState<GotifyMessage[]>([]);
	const [pollIntervalSeconds, setPollIntervalSeconds] = useState(
		String(DEFAULT_POLL_INTERVAL_SECONDS),
	);
	const [quietHoursEnabled, setQuietHoursEnabled] = useState(false);
	const [quietHoursStart, setQuietHoursStart] = useState(
		DEFAULT_QUIET_HOURS_START,
	);
	const [quietHoursEnd, setQuietHoursEnd] = useState(DEFAULT_QUIET_HOURS_END);
	const [disabledApplicationIds, setDisabledApplicationIds] = useState<
		number[]
	>([]);

	const lastStateError = useRef<string>();
	const messagesRequestId = useRef(0);

	const showError = useCallback((message: string) => {
		enqueueSnackbar({ message, variant: "error" });
	}, []);

	const applyState = useCallback((runtimeState: RuntimeState) => {
		setState(runtimeState);
		if (runtimeState.error && runtimeState.error !== lastStateError.current) {
			enqueueSnackbar({ message: runtimeState.error, variant: "error" });
			lastStateError.current = runtimeState.error;
		}
		if (!runtimeState.config) return;
		setBaseUrl(runtimeState.config.baseUrl);
		setPollIntervalSeconds(
			String(
				runtimeState.config.pollIntervalSeconds ??
					DEFAULT_POLL_INTERVAL_SECONDS,
			),
		);
		const settings = runtimeState.config.notificationSettings;
		setQuietHoursEnabled(settings?.quietHoursEnabled ?? false);
		setQuietHoursStart(settings?.quietHoursStart ?? DEFAULT_QUIET_HOURS_START);
		setQuietHoursEnd(settings?.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END);
		setDisabledApplicationIds(settings?.disabledApplicationIds ?? []);
	}, []);

	const loadState = useCallback(async () => {
		const response = await sendMessage({ type: "gotify/state" });
		if (!response.ok) {
			showError(response.error);
			return;
		}
		applyState(response.state ?? initialState);
	}, [applyState, showError]);

	const loadMessages = useCallback(
		async (applicationId?: number) => {
			const requestId = ++messagesRequestId.current;
			setMessagesLoading(true);
			const response = await sendMessage({
				type: "gotify/load-messages",
				applicationId,
			});
			if (requestId !== messagesRequestId.current) return;
			setMessagesLoading(false);
			if (!response.ok) {
				showError(response.error);
				return;
			}
			setMessages(response.messages ?? []);
		},
		[showError],
	);

	useEffect(() => {
		void (async () => {
			setLoading(true);
			await loadState();
			setLoading(false);
		})();
	}, [loadState]);

	useEffect(() => {
		const onStorageChanged = (
			changes: Record<string, browser.storage.StorageChange>,
			areaName: string,
		) => {
			const nextState = changes["gotify.state"]?.newValue as
				| RuntimeState
				| undefined;
			if (areaName === "local" && nextState) applyState(nextState);
		};
		browser.storage.onChanged.addListener(onStorageChanged);
		return () => browser.storage.onChanged.removeListener(onStorageChanged);
	}, [applyState]);

	const login = async () => {
		messagesRequestId.current += 1;
		setMessagesLoading(false);
		setSubmitting(true);
		const payload: LoginPayload = { baseUrl, token };
		const response = await sendMessage({ type: "gotify/login", payload });
		setSubmitting(false);
		if (!response.ok) return showError(response.error);
		applyState(response.state ?? initialState);
	};

	const logout = async (onSuccess?: () => void) => {
		messagesRequestId.current += 1;
		setMessagesLoading(false);
		setSubmitting(true);
		const response = await sendMessage({ type: "gotify/logout" });
		setSubmitting(false);
		if (!response.ok) return showError(response.error);
		setToken("");
		setMessages([]);
		onSuccess?.();
		applyState(response.state ?? initialState);
	};

	const saveSettings = async (onSuccess?: () => void) => {
		const seconds = Number(pollIntervalSeconds);
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/update-settings",
			pollIntervalSeconds: seconds,
			notificationSettings: {
				quietHoursEnabled,
				quietHoursStart,
				quietHoursEnd,
				disabledApplicationIds,
			},
		});
		setSubmitting(false);
		if (!response.ok) return showError(response.error);
		applyState(response.state ?? state);
		onSuccess?.();
		enqueueSnackbar({ message: "Settings saved", variant: "info" });
	};

	const deleteMessage = async (messageId: number) => {
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/delete-message",
			messageId,
		});
		setSubmitting(false);
		if (!response.ok) return showError(response.error);
		setMessages((current) =>
			current.filter((message) => message.id !== messageId),
		);
		enqueueSnackbar({ message: "Message deleted", variant: "info" });
	};

	const deleteAllMessages = async (
		selectedApplicationId?: number,
		onSuccess?: () => void,
	) => {
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/delete-all-messages",
			applicationId: selectedApplicationId,
		});
		setSubmitting(false);
		onSuccess?.();
		if (!response.ok) return showError(response.error);
		setMessages([]);
		enqueueSnackbar({ message: "Deleted all messages", variant: "info" });
	};

	return {
		state,
		loading,
		submitting,
		messagesLoading,
		baseUrl,
		setBaseUrl,
		token,
		setToken,
		messages,
		setMessages,
		pollIntervalSeconds,
		setPollIntervalSeconds,
		quietHoursEnabled,
		setQuietHoursEnabled,
		quietHoursStart,
		setQuietHoursStart,
		quietHoursEnd,
		setQuietHoursEnd,
		disabledApplicationIds,
		setDisabledApplicationIds,
		loadMessages,
		login,
		logout,
		saveSettings,
		deleteMessage,
		deleteAllMessages,
		showError,
	};
};
