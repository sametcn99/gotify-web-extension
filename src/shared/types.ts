export type AuthMode = "token";

export interface ServerConfig {
	id: string;
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

export interface UpdateInfo {
	currentVersion: string;
	latestVersion: string;
	releaseUrl: string;
}

export interface ServerRuntimeState {
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
	config?: Omit<ServerConfig, "id" | "token"> & { hasToken: boolean };
	recentMessages: GotifyMessage[];
	/** Messages received while the extension UI was not visible. */
	unreadCount?: number;
}

export interface RuntimeState {
	/** Server ids in insertion order; drives the UI server list. */
	serverOrder: string[];
	servers: Record<string, ServerRuntimeState>;
	/** Total unread messages across all servers; drives the action badge. */
	unreadCount?: number;
	/** Set only when a newer GitHub release than the installed version exists. */
	updateInfo?: UpdateInfo;
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
	| { type: "gotify/add-server"; payload: LoginPayload }
	| { type: "gotify/remove-server"; serverId: string }
	| { type: "gotify/state" }
	| { type: "gotify/sync" }
	| { type: "gotify/mark-ui-visible" }
	| {
			type: "gotify/load-messages";
			serverId: string;
			applicationId?: number;
	  }
	| { type: "gotify/delete-message"; serverId: string; messageId: number }
	| {
			type: "gotify/delete-all-messages";
			serverId: string;
			applicationId?: number;
	  }
	| {
			type: "gotify/update-settings";
			serverId: string;
			pollIntervalSeconds: number;
			notificationSettings?: NotificationSettings;
	  };

export type BackgroundResponse =
	| {
			ok: true;
			state?: RuntimeState;
			messages?: GotifyMessage[];
			/** Present on gotify/add-server: the id of the newly added server. */
			serverId?: string;
	  }
	| { ok: false; error: string };
