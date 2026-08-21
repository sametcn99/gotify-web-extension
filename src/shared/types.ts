export type AuthMode = "token";

export interface GotifyConfig {
	baseUrl: string;
	authMode: AuthMode;
	token: string;
	pollIntervalSeconds?: number;
	notificationSettings?: NotificationSettings;
}

export interface NotificationSettings {
	quietHoursEnabled: boolean;
	quietHoursStart: string;
	quietHoursEnd: string;
	disabledApplicationIds: number[];
}

export interface GotifyMessage {
	id: number;
	appid: number;
	message: string;
	title: string;
	priority: number;
	date: string;
	image?: string;
	extras?: Record<string, unknown>;
}

export interface GotifyApplication {
	id: number;
	name: string;
	image?: string;
}

export interface PagedMessages {
	paging: {
		next?: string;
		since?: number;
		size: number;
		limit: number;
	};
	messages: GotifyMessage[];
}

export interface CurrentUser {
	id: number;
	name: string;
	admin: boolean;
	createdAt: string;
	clientId?: number;
	elevatedUntil?: string;
}

export type ConnectionStatus =
	| "logged_out"
	| "connecting"
	| "connected"
	| "error";

export interface RuntimeState {
	status: ConnectionStatus;
	error?: string;
	lastSyncAt?: number;
	lastProcessedMessageId?: number;
	/** @deprecated Migrated to lastProcessedMessageId. */
	lastNotifiedMessageId?: number;
	notificationBaselineId?: number;
	notificationsInitialized?: boolean;
	user?: CurrentUser;
	applications?: Record<string, GotifyApplication>;
	notificationTargets?: Record<string, string>;
	config?: Omit<GotifyConfig, "token"> & { hasToken: boolean };
	recentMessages: GotifyMessage[];
	/** Messages received while the extension UI was not visible. */
	unreadCount?: number;
}

export interface LoginPayload {
	baseUrl: string;
	token: string;
}

export interface LoginResult {
	ok: boolean;
	error?: string;
	state?: RuntimeState;
}

export type BackgroundRequest =
	| { type: "gotify/login"; payload: LoginPayload }
	| { type: "gotify/logout" }
	| { type: "gotify/state" }
	| { type: "gotify/sync" }
	| { type: "gotify/clear-recent-messages" }
	| { type: "gotify/mark-ui-visible" }
	| { type: "gotify/load-messages"; applicationId?: number }
	| { type: "gotify/delete-message"; messageId: number }
	| { type: "gotify/delete-all-messages"; applicationId?: number }
	| {
			type: "gotify/update-settings";
			pollIntervalSeconds: number;
			notificationSettings?: NotificationSettings;
	  };

export type BackgroundResponse =
	| { ok: true; state?: RuntimeState; messages?: GotifyMessage[] }
	| { ok: false; error: string };
