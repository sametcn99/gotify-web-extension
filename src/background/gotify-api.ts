import type {
	CurrentUser,
	GotifyApplication,
	GotifyConfig,
	GotifyMessage,
	PagedMessages,
} from "../shared/types";

const MESSAGE_PAGE_SIZE = 200;
const DELETE_ORIGIN_RULE_ID = 1;

type NetworkRule = {
	id: number;
	priority: number;
	action: {
		type: "modifyHeaders";
		requestHeaders: Array<{ header: string; operation: "remove" }>;
	};
	condition: {
		regexFilter: string;
		initiatorDomains: string[];
		requestMethods?: Array<"delete">;
		resourceTypes: Array<"xmlhttprequest">;
	};
};

type NetworkApis = {
	declarativeNetRequest?: {
		updateDynamicRules: (details: {
			removeRuleIds: number[];
			addRules: NetworkRule[];
		}) => Promise<void>;
	};
	webRequest?: {
		onBeforeSendHeaders: {
			addListener: (
				listener: (details: {
					method: string;
					originUrl?: string;
					type: string;
					url: string;
					requestHeaders?: Array<{ name: string; value?: string }>;
				}) => { requestHeaders?: Array<{ name: string; value?: string }> },
				filter: { urls: string[]; types: string[] },
				extraInfoSpec: string[],
			) => void;
		};
	};
};

const networkApis = browser as unknown as NetworkApis;
const manifestVersion = browser.runtime.getManifest().manifest_version;
const extensionRootUrl = browser.runtime.getURL("");
let firefoxGotifyBaseUrl: string | undefined;

const escapeRegex = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const deduplicateAndSortMessages = (messages: GotifyMessage[]) => {
	const uniqueMessages = new Map<number, GotifyMessage>();
	for (const message of messages) {
		uniqueMessages.set(message.id, message);
	}
	return [...uniqueMessages.values()].sort((a, b) => b.id - a.id);
};

const apiPathFor = (
	requestUrl: string,
	baseUrl: string,
): string | undefined => {
	const url = new URL(requestUrl);
	const base = new URL(baseUrl);
	if (url.host !== base.host || url.protocol !== base.protocol) {
		return undefined;
	}

	const basePath = base.pathname.replace(/\/+$/, "");
	if (basePath && !url.pathname.startsWith(`${basePath}/`)) {
		return undefined;
	}
	return url.pathname.slice(basePath.length);
};

const shouldRemoveOrigin = (
	details: { method: string; type: string; url: string },
	baseUrl: string,
): boolean => {
	const path = apiPathFor(details.url, baseUrl);
	return (
		details.method === "DELETE" &&
		(path === "/message" ||
			/^\/message\/\d+$/.test(path ?? "") ||
			/^\/application\/\d+\/message$/.test(path ?? ""))
	);
};

if (manifestVersion === 2 && networkApis.webRequest) {
	networkApis.webRequest.onBeforeSendHeaders.addListener(
		(details) => {
			if (
				!details.originUrl?.startsWith(extensionRootUrl) ||
				!firefoxGotifyBaseUrl ||
				!shouldRemoveOrigin(details, firefoxGotifyBaseUrl)
			) {
				return {};
			}
			return {
				requestHeaders: details.requestHeaders?.filter(
					(header) => header.name.toLowerCase() !== "origin",
				),
			};
		},
		{
			urls: ["http://*/*", "https://*/*"],
			types: ["xmlhttprequest"],
		},
		["blocking", "requestHeaders"],
	);
}

export const normalizeBaseUrl = (rawUrl: string): string =>
	new URL(rawUrl).toString().replace(/\/+$/, "");

export const configureOriginBypass = async (
	config: GotifyConfig | null,
): Promise<void> => {
	firefoxGotifyBaseUrl = config?.baseUrl;
	if (manifestVersion !== 3) {
		return;
	}

	const declarativeNetRequest = networkApis.declarativeNetRequest;
	if (!declarativeNetRequest) {
		throw new Error("Browser cannot configure Gotify network requests");
	}

	if (!config) {
		await declarativeNetRequest.updateDynamicRules({
			removeRuleIds: [DELETE_ORIGIN_RULE_ID],
			addRules: [],
		});
		return;
	}

	const deleteRule: NetworkRule = {
		id: DELETE_ORIGIN_RULE_ID,
		priority: 1,
		action: {
			type: "modifyHeaders",
			requestHeaders: [{ header: "Origin", operation: "remove" }],
		},
		condition: {
			regexFilter: `^${escapeRegex(config.baseUrl)}/(?:message(?:/[0-9]+)?|application/[0-9]+/message)(?:\\?.*)?$`,
			initiatorDomains: [browser.runtime.id],
			requestMethods: ["delete"],
			resourceTypes: ["xmlhttprequest"],
		},
	};

	await declarativeNetRequest.updateDynamicRules({
		removeRuleIds: [DELETE_ORIGIN_RULE_ID],
		addRules: [deleteRule],
	});
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

export const request = (
	config: GotifyConfig,
	path: string,
	init?: RequestInit,
) =>
	// Gotify's paging.next is returned as a full URL already; concatenating it
	// onto baseUrl (like our own relative paths) would double the origin.
	fetch(isAbsoluteUrl(path) ? path : `${config.baseUrl}${path}`, {
		credentials: "omit",
		...(init ?? {}),
		headers: {
			"X-Gotify-Key": config.token,
			...(init?.headers ?? {}),
		},
	});

export const fetchApplications = async (
	config: GotifyConfig,
): Promise<Record<string, GotifyApplication>> => {
	const response = await request(config, "/application");
	if (!response.ok) {
		throw new Error(`Loading applications failed: ${response.status}`);
	}
	const applications = (await response.json()) as GotifyApplication[];
	return Object.fromEntries(
		applications.map((application) => [String(application.id), application]),
	);
};

export const fetchAllMessages = async (
	config: GotifyConfig,
	applicationId?: number,
): Promise<GotifyMessage[]> => {
	let path =
		applicationId === undefined
			? `/message?limit=${MESSAGE_PAGE_SIZE}`
			: `/application/${applicationId}/message?limit=${MESSAGE_PAGE_SIZE}`;
	const messages: GotifyMessage[] = [];
	const visitedPaths = new Set<string>();

	for (;;) {
		if (visitedPaths.has(path)) {
			throw new Error(
				"Gotify returned a repeated paging URL while loading messages",
			);
		}
		visitedPaths.add(path);
		const response = await request(config, path);
		if (!response.ok) {
			throw new Error(`Loading messages failed: ${response.status}`);
		}
		const payload = (await response.json()) as PagedMessages;
		messages.push(...(payload.messages ?? []));
		if (!payload.paging?.next) break;
		path = payload.paging.next;
	}
	return deduplicateAndSortMessages(messages);
};

export const fetchMessagesAfter = async (
	config: GotifyConfig,
	afterId: number,
): Promise<GotifyMessage[]> => {
	let path = `/message?limit=${MESSAGE_PAGE_SIZE}`;
	const messages: GotifyMessage[] = [];
	const visitedPaths = new Set<string>();

	for (;;) {
		if (visitedPaths.has(path)) {
			throw new Error("Gotify returned a repeated paging URL during sync");
		}
		visitedPaths.add(path);
		const response = await request(config, path);
		if (!response.ok) {
			throw new Error(`Sync failed with status ${response.status}`);
		}
		const payload = (await response.json()) as PagedMessages;
		const pageMessages = payload.messages ?? [];
		messages.push(...pageMessages.filter((message) => message.id > afterId));
		if (
			!payload.paging?.next ||
			pageMessages.length === 0 ||
			pageMessages.some((message) => message.id <= afterId)
		) {
			break;
		}
		path = payload.paging.next;
	}
	return deduplicateAndSortMessages(messages);
};

export const getLatestMessageId = async (
	config: GotifyConfig,
): Promise<number> => {
	const response = await request(config, "/message?limit=1");
	if (!response.ok) {
		throw new Error(`Message baseline failed: ${response.status}`);
	}
	const payload = (await response.json()) as PagedMessages;
	return Math.max(0, ...(payload.messages ?? []).map((message) => message.id));
};

export const validateClientToken = async (
	config: GotifyConfig,
): Promise<CurrentUser> => {
	const response = await request(config, "/current/user");
	if (!response.ok) {
		throw new Error(`Token validation failed: ${response.status}`);
	}
	return (await response.json()) as CurrentUser;
};
