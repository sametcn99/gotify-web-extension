import type { RuntimeState } from "../shared/types";

export const initialState: RuntimeState = {
	status: "logged_out",
	recentMessages: [],
};
export const DEFAULT_POLL_INTERVAL_SECONDS = 60;
export const MIN_POLL_INTERVAL_SECONDS = 5;
export const MAX_POLL_INTERVAL_SECONDS = 3600;
export const DEFAULT_QUIET_HOURS_START = "22:00";
export const DEFAULT_QUIET_HOURS_END = "07:00";
export const MESSAGE_PREVIEW_LENGTH = 500;
