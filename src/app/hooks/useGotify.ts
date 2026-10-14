import { enqueueSnackbar } from "notistack";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	GotifyMessage,
	LoginPayload,
	RuntimeState,
	ServerRuntimeState,
} from "../../shared/types";
import {
	DEFAULT_POLL_INTERVAL_SECONDS,
	DEFAULT_QUIET_HOURS_END,
	DEFAULT_QUIET_HOURS_START,
	initialState,
} from "../constants";
import { sendMessage } from "../utils";

interface StorageChange {
	oldValue?: unknown;
	newValue?: unknown;
}

const ACTIVE_SERVER_STORAGE_KEY = "gotify-active-server";

export interface ServerListItem {
	id: string;
	baseUrl: string;
	unreadCount: number;
}

export const useGotify = () => {
	const [state, setState] = useState<RuntimeState>(initialState);
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [messagesLoading, setMessagesLoading] = useState(false);
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");
	const [messages, setMessages] = useState<GotifyMessage[]>([]);
	const [activeServerId, setActiveServerIdState] = useState<string | undefined>(
		() => localStorage.getItem(ACTIVE_SERVER_STORAGE_KEY) ?? undefined,
	);
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

	const stateRef = useRef<RuntimeState>(initialState);
	const activeServerIdRef = useRef<string | undefined>(activeServerId);
	const lastStateError = useRef<string | undefined>(undefined);
	const messagesRequestId = useRef(0);

	const showError = useCallback((message: string) => {
		enqueueSnackbar({ message, variant: "error" });
	}, []);

	// Drafts are hydrated only on mount, server switch, and save responses.
	// Background writes state on every sync of every server, so hydrating on
	// each state change would clobber an open, unsaved settings dialog.
	const hydrateDraftsFor = useCallback((serverId: string | undefined) => {
		const config = serverId
			? stateRef.current.servers[serverId]?.config
			: undefined;
		if (!config) return;
		setPollIntervalSeconds(
			String(config.pollIntervalSeconds ?? DEFAULT_POLL_INTERVAL_SECONDS),
		);
		const settings = config.notificationSettings;
		setQuietHoursEnabled(settings?.quietHoursEnabled ?? false);
		setQuietHoursStart(settings?.quietHoursStart ?? DEFAULT_QUIET_HOURS_START);
		setQuietHoursEnd(settings?.quietHoursEnd ?? DEFAULT_QUIET_HOURS_END);
		setDisabledApplicationIds(settings?.disabledApplicationIds ?? []);
	}, []);

	const applyState = useCallback((runtimeState: RuntimeState) => {
		stateRef.current = runtimeState;
		setState(runtimeState);
		const currentServerId = activeServerIdRef.current;
		const activeError = currentServerId
			? runtimeState.servers[currentServerId]?.error
			: undefined;
		if (activeError && activeError !== lastStateError.current) {
			enqueueSnackbar({ message: activeError, variant: "error" });
			lastStateError.current = activeError;
		}
	}, []);

	const setActiveServer = useCallback(
		(serverId: string) => {
			localStorage.setItem(ACTIVE_SERVER_STORAGE_KEY, serverId);
			activeServerIdRef.current = serverId;
			setActiveServerIdState(serverId);
			hydrateDraftsFor(serverId);
		},
		[hydrateDraftsFor],
	);

	// Keep the stored selection valid: fall back to the first server when the
	// saved one no longer exists (removed, or storage from another machine).
	const resolvedActiveServerId =
		activeServerId && state.serverOrder.includes(activeServerId)
			? activeServerId
			: state.serverOrder[0];
	useEffect(() => {
		if (resolvedActiveServerId && resolvedActiveServerId !== activeServerId) {
			setActiveServer(resolvedActiveServerId);
		}
	}, [activeServerId, resolvedActiveServerId, setActiveServer]);

	const loadStateFromBackground = useCallback(async () => {
		const response = await sendMessage({ type: "gotify/state" });
		if (!response.ok) {
			showError(response.error);
			return;
		}
		const runtimeState = response.state ?? initialState;
		applyState(runtimeState);
		hydrateDraftsFor(activeServerIdRef.current);
	}, [applyState, hydrateDraftsFor, showError]);

	const loadMessages = useCallback(
		async (serverId: string, applicationId?: number) => {
			const requestId = ++messagesRequestId.current;
			setMessagesLoading(true);
			const response = await sendMessage({
				type: "gotify/load-messages",
				serverId,
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
			await loadStateFromBackground();
			setLoading(false);
		})();
	}, [loadStateFromBackground]);

	useEffect(() => {
		const markUiVisible = () => {
			void sendMessage({ type: "gotify/mark-ui-visible" });
		};
		markUiVisible();
		const onVisibilityChange = () => {
			if (document.visibilityState === "visible") markUiVisible();
		};
		document.addEventListener("visibilitychange", onVisibilityChange);
		return () =>
			document.removeEventListener("visibilitychange", onVisibilityChange);
	}, []);

	useEffect(() => {
		const onStorageChanged = (
			changes: Record<string, StorageChange>,
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

	const addServer = async (payload: LoginPayload, onSuccess?: () => void) => {
		messagesRequestId.current += 1;
		setMessagesLoading(false);
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/add-server",
			payload,
		});
		setSubmitting(false);
		if (!response.ok) return showError(response.error);
		setToken("");
		setMessages([]);
		applyState(response.state ?? initialState);
		if (response.serverId) {
			setActiveServer(response.serverId);
			hydrateDraftsFor(response.serverId);
		}
		onSuccess?.();
	};

	const removeServer = async (serverId: string, onSuccess?: () => void) => {
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/remove-server",
			serverId,
		});
		setSubmitting(false);
		if (!response.ok) return showError(response.error);
		if (serverId === activeServerIdRef.current) {
			setMessages([]);
			setToken("");
		}
		applyState(response.state ?? initialState);
		onSuccess?.();
		enqueueSnackbar({ message: "Server removed", variant: "info" });
	};

	const saveSettings = async (onSuccess?: () => void) => {
		const serverId = activeServerIdRef.current;
		if (!serverId) return showError("No server selected");
		const seconds = Number(pollIntervalSeconds);
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/update-settings",
			serverId,
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
		applyState(response.state ?? stateRef.current);
		hydrateDraftsFor(serverId);
		onSuccess?.();
		enqueueSnackbar({ message: "Settings saved", variant: "info" });
	};

	const deleteMessage = async (messageId: number) => {
		const serverId = activeServerIdRef.current;
		if (!serverId) return showError("No server selected");
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/delete-message",
			serverId,
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
		const serverId = activeServerIdRef.current;
		if (!serverId) return showError("No server selected");
		setSubmitting(true);
		const response = await sendMessage({
			type: "gotify/delete-all-messages",
			serverId,
			applicationId: selectedApplicationId,
		});
		setSubmitting(false);
		onSuccess?.();
		if (!response.ok) return showError(response.error);
		setMessages([]);
		enqueueSnackbar({ message: "Deleted all messages", variant: "info" });
	};

	const serverList: ServerListItem[] = state.serverOrder.flatMap((serverId) => {
		const slice = state.servers[serverId];
		const serverBaseUrl = slice?.config?.baseUrl;
		if (!slice || !serverBaseUrl) return [];
		return [
			{
				id: serverId,
				baseUrl: serverBaseUrl,
				unreadCount: slice.unreadCount ?? 0,
			},
		];
	});

	const activeServerState: ServerRuntimeState | undefined =
		resolvedActiveServerId ? state.servers[resolvedActiveServerId] : undefined;

	return {
		state,
		activeServerId: resolvedActiveServerId,
		activeServerState,
		serverList,
		setActiveServer,
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
		addServer,
		removeServer,
		saveSettings,
		deleteMessage,
		deleteAllMessages,
		showError,
	};
};
