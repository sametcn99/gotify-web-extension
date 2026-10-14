/**
 * In-memory Gotify API mock. Emulates the parts of Gotify the extension uses,
 * including two behaviors that matter for correctness:
 *  - requests must carry X-Gotify-Key,
 *  - DELETEs bearing an Origin header are rejected (the real server rejects
 *    cross-origin deletes; the extension strips Origin via DNR rules).
 */
export interface MockGotify {
	port: number;
	baseUrl: string;
	addMessage: (payload: {
		appid: number;
		title: string;
		message: string;
		priority?: number;
	}) => number;
	deleteRequests: Array<{ path: string; hadOrigin: boolean }>;
	stop: () => Promise<void>;
}

interface MockMessage {
	id: number;
	appid: number;
	message: string;
	title: string;
	priority: number;
	date: string;
}

export const startMockGotify = (options: {
	port: number;
	applications: Array<{ id: number; name: string }>;
	messages: Array<{
		appid: number;
		title: string;
		message: string;
		priority?: number;
	}>;
}): MockGotify => {
	const applications = options.applications.map((app) => ({ ...app }));
	let nextId = 1;
	const messages: MockMessage[] = options.messages.map((seed) => ({
		id: nextId++,
		appid: seed.appid,
		message: seed.message,
		title: seed.title,
		priority: seed.priority ?? 5,
		date: new Date(Date.now() - nextId * 60_000).toISOString(),
	}));
	const deleteRequests: Array<{ path: string; hadOrigin: boolean }> = [];

	const json = (data: unknown, status = 200) =>
		new Response(JSON.stringify(data), {
			status,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": "*",
			},
		});

	const server = Bun.serve({
		port: options.port,
		fetch: async (request) => {
			const url = new URL(request.url);
			const path = url.pathname;
			const origin = request.headers.get("origin");

			if (!request.headers.get("x-gotify-key")) {
				return json({ error: "unauthorized" }, 401);
			}
			if (
				request.method === "DELETE" &&
				path.match(/^\/(message(\/\d+)?|application\/\d+\/message)$/)
			) {
				// Gotify rejects cross-origin deletes; the extension must strip
				// the Origin header via its dynamic rules for deletes to pass.
				if (origin) {
					return json({ error: "cross-origin delete rejected" }, 403);
				}
				deleteRequests.push({ path, hadOrigin: Boolean(origin) });
				if (path === "/message") {
					messages.length = 0;
				} else if (path.startsWith("/application/")) {
					const appId = Number(path.split("/")[2]);
					for (let i = messages.length - 1; i >= 0; i -= 1) {
						if (messages[i].appid === appId) messages.splice(i, 1);
					}
				} else {
					const id = Number(path.split("/")[2]);
					const index = messages.findIndex((m) => m.id === id);
					if (index >= 0) messages.splice(index, 1);
				}
				return json({});
			}

			if (request.method === "POST" && path === "/message") {
				const body = (await request.json()) as {
					appid: number;
					title?: string;
					message?: string;
					priority?: number;
				};
				const created: MockMessage = {
					id: nextId++,
					appid: body.appid,
					message: body.message ?? "",
					title: body.title ?? "",
					priority: body.priority ?? 5,
					date: new Date().toISOString(),
				};
				messages.unshift(created);
				return json(created);
			}

			if (request.method === "GET") {
				if (path === "/current/user") {
					return json({
						id: 1,
						name: `user-${options.port}`,
						admin: true,
						createdAt: "2026-01-01T00:00:00Z",
					});
				}
				if (path === "/application") {
					return json(applications);
				}
				const appMessages = path.match(/^\/application\/(\d+)\/message$/);
				if (path === "/message" || appMessages) {
					const appId = appMessages ? Number(appMessages[1]) : undefined;
					const relevant = appId
						? messages.filter((m) => m.appid === appId)
						: messages;
					const limit = Number(url.searchParams.get("limit") ?? 200);
					// Gotify always serves pages newest-first.
					const sorted = [...relevant].sort((a, b) => b.id - a.id);
					const page = sorted.slice(0, limit);
					return json({
						messages: page,
						paging: {
							size: page.length,
							limit,
							since: page.length > 0 ? page[page.length - 1].id : 0,
						},
					});
				}
			}

			return json({ error: `no route ${request.method} ${path}` }, 404);
		},
	});

	return {
		port: options.port,
		baseUrl: `http://localhost:${options.port}`,
		addMessage: (payload) => {
			const created: MockMessage = {
				id: nextId++,
				appid: payload.appid,
				message: payload.message,
				title: payload.title,
				priority: payload.priority ?? 5,
				date: new Date().toISOString(),
			};
			messages.unshift(created);
			return created.id;
		},
		deleteRequests,
		stop: async () => {
			server.stop(true);
		},
	};
};
