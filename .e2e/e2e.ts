import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { startMockGotify, type MockGotify } from "./mock-gotify";

const EXTENSION_PATH = path.resolve(import.meta.dir, "../dist/chromium");
const PROFILE_DIR = path.resolve(import.meta.dir, ".profile");

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
let failures = 0;

const check = async (name: string, fn: () => Promise<string | void>) => {
	try {
		const detail = await fn();
		results.push({ name, ok: true, detail: detail || undefined });
		console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
	} catch (error) {
		failures += 1;
		const message = error instanceof Error ? error.message : String(error);
		results.push({ name, ok: false, detail: message });
		console.log(`FAIL  ${name} — ${message}`);
	}
};

const assert = (condition: boolean, message: string) => {
	if (!condition) throw new Error(message);
};

const waitFor = async (
	operation: () => Promise<boolean>,
	timeoutMs: number,
	description: string,
) => {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await operation()) return;
		if (Date.now() > deadline) {
			throw new Error(`Timed out waiting for ${description}`);
		}
		await wait(250);
	}
};

const startMock = (port: number) =>
	startMockGotify({
		port,
		applications:
			port === 8801
				? [
						{ id: 1, name: "Backup" },
						{ id: 2, name: "CI" },
					]
				: [{ id: 10, name: "Mail" }],
		messages:
			port === 8801
				? [
						{ appid: 1, title: "A-message-1", message: "first" },
						{ appid: 2, title: "A-message-2", message: "second" },
						{ appid: 1, title: "A-message-3", message: "third" },
					]
				: [
						{ appid: 10, title: "B-message-1", message: "bee one" },
						{ appid: 10, title: "B-message-2", message: "bee two" },
					],
	});

const main = async () => {
	const mockA = startMock(8801);
	const mockB = startMock(8802);
	const mocks: MockGotify[] = [mockA, mockB];

	rmSync(PROFILE_DIR, { recursive: true, force: true });
	mkdirSync(PROFILE_DIR, { recursive: true });

	const context = await chromium.launchPersistentContext(PROFILE_DIR, {
		channel: "msedge",
		headless: false,
		args: [
			`--disable-extensions-except=${EXTENSION_PATH}`,
			`--load-extension=${EXTENSION_PATH}`,
			"--no-first-run",
			"--no-default-browser-check",
		],
	});

	try {
		let serviceWorker = context.serviceWorkers()[0];
		if (!serviceWorker) {
			serviceWorker = await context.waitForEvent("serviceworker", {
				timeout: 20_000,
			});
		}
		const extensionId = new URL(serviceWorker.url()).host;
		console.log(`extension loaded: ${extensionId}`);

		const optionsUrl = `chrome-extension://${extensionId}/options/index.html`;
		const readStorage = <T>(key: string) =>
			serviceWorker.evaluate(
				async (k) =>
					((await chrome.storage.local.get(k))[k] ?? null) as T,
				key,
			);
		const badgeText = () =>
			serviceWorker.evaluate(async () => chrome.action.getBadgeText({}));
		const dynamicRules = () =>
			serviceWorker.evaluate(async () =>
				chrome.declarativeNetRequest.getDynamicRules(),
			);
		const notificationIds = () =>
			serviceWorker.evaluate(async () => {
				const all = await chrome.notifications.getAll();
				return Object.keys(all);
			});

		const blank = await context.newPage();
		await blank.goto("about:blank");

		const page = await context.newPage();

		// --- S1: fresh install shows the login form -------------------------
		await check("S1 fresh install opens the login form", async () => {
			await page.goto(optionsUrl);
			await page.getByLabel("Gotify URL").waitFor({ timeout: 10_000 });
			return "login form visible";
		});

		// --- S2: add the first server ---------------------------------------
		await check("S2 first server connects and loads its messages", async () => {
			await page.getByLabel("Gotify URL").fill(mockA.baseUrl);
			await page.getByLabel("Client token").fill("token-a");
			await page.getByRole("button", { name: "Login" }).click();
			await page
				.getByText("A-message-3")
				.first()
				.waitFor({ timeout: 15_000 });
			await page.getByText("A-message-1").first().waitFor({ timeout: 5_000 });
			return "server A messages listed";
		});

		await check("S2b header dropdown lists the server", async () => {
			await page.getByText("localhost:8801").first().waitFor();
			return "dropdown shows localhost:8801";
		});

		// --- S3: add a second server through the dropdown --------------------
		await check("S3 second server can be added from the dropdown", async () => {
			await page.getByRole("combobox").click();
			await page.getByRole("option", { name: "Add server…" }).click();
			await page.getByLabel("Gotify URL").fill(mockB.baseUrl);
			await page.getByLabel("Client token").fill("token-b");
			await page.getByRole("button", { name: "Connect" }).click();
			await page
				.getByText("B-message-2")
				.first()
				.waitFor({ timeout: 15_000 });
			return "switched to server B with its messages";
		});

		// --- S4: switch servers via dropdown ---------------------------------
		await check("S4 dropdown switches the active server", async () => {
			await page.getByRole("combobox").click();
			await page.getByRole("option", { name: "localhost:8801" }).click();
			await page
				.getByText("A-message-3")
				.first()
				.waitFor({ timeout: 10_000 });
			const bVisible = await page.getByText("B-message-1").count();
			assert(bVisible === 0, "server B messages should not be visible");
			await page.getByRole("combobox").click();
			await page.getByRole("option", { name: "localhost:8802" }).click();
			await page
				.getByText("B-message-1")
				.first()
				.waitFor({ timeout: 10_000 });
			return "A <-> B switching works both ways";
		});

		// --- S5: settings dialog lists servers; per-server poll interval -----
		await check("S5 settings manages servers and per-server intervals", async () => {
			await page.getByRole("button", { name: "Settings" }).click();
			const dialog = page.getByRole("dialog");
			await dialog.getByText("localhost:8801").first().waitFor({ timeout: 10_000 });
			await dialog.getByText("localhost:8802").first().waitFor({ timeout: 5_000 });
			await dialog
				.getByLabel("Polling interval (seconds)")
				.fill("5");
			await page.getByRole("button", { name: "Save settings" }).click();
			await dialog.waitFor({ state: "hidden", timeout: 10_000 });

			const servers = await readStorage<Array<{ baseUrl: string; pollIntervalSeconds: number }>>(
				"gotify.servers",
			);
			assert(servers !== null, "gotify.servers should exist");
			assert(servers.length === 2, `expected 2 servers, got ${servers.length}`);
			const serverB = servers.find((s) => s.baseUrl === mockB.baseUrl);
			assert(
				serverB?.pollIntervalSeconds === 5,
				`server B interval should be 5, got ${serverB?.pollIntervalSeconds}`,
			);
			const serverA = servers.find((s) => s.baseUrl === mockA.baseUrl);
			assert(
				serverA?.pollIntervalSeconds === 60,
				`server A interval should stay 60, got ${serverA?.pollIntervalSeconds}`,
			);
			return "server B interval=5, server A stays 60";
		});

		await check("S5b server A keeps its own interval when edited", async () => {
			await page.getByRole("button", { name: "Settings" }).click();
			await page
				.getByRole("dialog")
				.getByLabel("Polling interval (seconds)")
				.waitFor({ timeout: 10_000 });
			const value = await page
				.getByRole("dialog")
				.getByLabel("Polling interval (seconds)")
				.inputValue();
			assert(value === "5", `dialog for B should show 5, got ${value}`);
			await page.getByRole("button", { name: "Cancel" }).click();
			await page.getByRole("combobox").click();
			await page.getByRole("option", { name: "localhost:8801" }).click();
			await page.getByText("A-message-1").first().waitFor({ timeout: 10_000 });
			await page.getByRole("button", { name: "Settings" }).click();
			await page
				.getByRole("dialog")
				.getByLabel("Polling interval (seconds)")
				.fill("5");
			await page.getByRole("button", { name: "Save settings" }).click();
			await page
				.getByRole("dialog")
				.waitFor({ state: "hidden", timeout: 10_000 });
			const servers = await readStorage<Array<{ baseUrl: string; pollIntervalSeconds: number }>>(
				"gotify.servers",
			);
			assert(
				servers.every((s) => s.pollIntervalSeconds === 5),
				"both servers should now poll every 5s",
			);
			return "per-server dialogs load the right values";
		});

		// --- S6/S7: live polling, badge total, notifications -----------------
		await check("S7 live polling accumulates per-server unread and badge", async () => {
			await page.close();
			mockA.addMessage({
				appid: 1,
				title: "A-live-1",
				message: "live from A",
				priority: 6,
			});
			mockB.addMessage({
				appid: 10,
				title: "B-live-1",
				message: "live from B",
				priority: 6,
			});
			await wait(11_000);
			const state = await readStorage<{
				serverOrder: string[];
				servers: Record<
					string,
					{ unreadCount?: number; config?: { baseUrl: string } }
				>;
				unreadCount?: number;
			}>("gotify.state");
			const byUrl = Object.fromEntries(
				Object.entries(state.servers).map(([sliceId, slice]) => [
					`${sliceId.slice(0, 8)}:${slice.config?.baseUrl}`,
					slice.unreadCount ?? 0,
				]),
			);
			const dump = JSON.stringify(byUrl);
			assert(
				Object.values(state.servers).find(
					(slice) => slice.config?.baseUrl === mockA.baseUrl,
				)?.unreadCount === 1,
				`server A unread should be 1 — slices: ${dump}`,
			);
			assert(
				Object.values(state.servers).find(
					(slice) => slice.config?.baseUrl === mockB.baseUrl,
				)?.unreadCount === 1,
				`server B unread should be 1 — slices: ${dump}`,
			);
			assert(
				state.unreadCount === 2,
				`total unread should be 2, got ${state.unreadCount} — slices: ${dump}`,
			);
			const badge = await badgeText();
			assert(badge === "2", `badge should show "2", got "${badge}"`);
			return "unread 1+1, badge shows 2";
		});

		await check("S7b live messages raised namespaced notifications", async () => {
			const ids = await notificationIds();
			const serverIds = await readStorage<
				Array<{ id: string; baseUrl: string }>
			>("gotify.servers");
			const idA = serverIds.find((s) => s.baseUrl === mockA.baseUrl)?.id;
			const idB = serverIds.find((s) => s.baseUrl === mockB.baseUrl)?.id;
			assert(
				idA && ids.some((n) => n.startsWith(`gotify-${idA}-`)),
				"no notification id namespaced with server A",
			);
			assert(
				idB && ids.some((n) => n.startsWith(`gotify-${idB}-`)),
				"no notification id namespaced with server B",
			);
			return `${ids.length} notification(s), correctly namespaced`;
		});

		// --- S8: reopening the UI clears unread ------------------------------
		const page2 = await context.newPage();
		await check("S8 reopening the UI resets unread and badge", async () => {
			await page2.goto(optionsUrl);
			await page2.getByRole("combobox").waitFor({ timeout: 10_000 });
			await waitFor(
				async () => (await badgeText()) === "",
				8_000,
				"badge to clear",
			);
			const state = await readStorage<{ unreadCount?: number }>("gotify.state");
			assert(state.unreadCount === 0, `unread should be 0, got ${state.unreadCount}`);
			return "badge cleared, unread reset";
		});

		// --- S9: delete message exercises the Origin-stripping rule ---------
		await check("S9 message delete works without Origin (DNR rule)", async () => {
			await page2
				.getByRole("button", { name: "Delete message" })
				.first()
				.click();
			await waitFor(
				async () => mockA.deleteRequests.length + mockB.deleteRequests.length > 0,
				8_000,
				"mock to receive a DELETE",
			);
			await page2
				.getByText("Deleted", { exact: false })
				.first()
				.waitFor({ timeout: 5_000 });
			const all = [...mockA.deleteRequests, ...mockB.deleteRequests];
			assert(
				all.every((request) => !request.hadOrigin),
				"a DELETE arrived with an Origin header",
			);
			return `${all.length} DELETE accepted without Origin`;
		});

		// --- S10: remove a server --------------------------------------------
		await check("S10 removing a server cleans up config, state and DNR", async () => {
			await page2.getByRole("button", { name: "Settings" }).click();
			const dialog = page2.getByRole("dialog");
			await dialog.getByText("localhost:8801").first().waitFor({ timeout: 10_000 });
			await dialog
				.getByRole("button", { name: "Remove localhost:8801" })
				.click();
			await page2
				.getByRole("button", { name: "Remove", exact: true })
				.click();
			await dialog.waitFor({ state: "hidden", timeout: 10_000 });

			const servers = await readStorage<Array<{ baseUrl: string }>>("gotify.servers");
			assert(servers !== null && servers.length === 1, "expected 1 server left");
			assert(servers[0].baseUrl === mockB.baseUrl, "server B should remain");

			const state = await readStorage<{ serverOrder: string[] }>("gotify.state");
			assert(state.serverOrder.length === 1, "state should hold one slice");

			const rules = await dynamicRules();
			assert(rules.length === 1, `expected 1 DNR rule, got ${rules.length}`);
			assert(
				(rules[0].condition as { regexFilter?: string }).regexFilter?.includes(
					"localhost:8802",
				) === true,
				"remaining rule should target server B",
			);

			await page2.getByRole("combobox").click();
			const aOptions = await page2
				.getByRole("option", { name: "localhost:8801" })
				.count();
			assert(aOptions === 0, "removed server still listed in dropdown");
			await page2.keyboard.press("Escape");
			return "only server B remains everywhere";
		});

		// --- S11: legacy single-server migration ------------------------------
		await check("S11 legacy single-server storage migrates after reload", async () => {
			await serviceWorker.evaluate(async (aBaseUrl) => {
				await chrome.storage.local.remove([
					"gotify.servers",
					"gotify.state",
					"gotify.config",
				]);
				await chrome.storage.local.set({
					"gotify.config": {
						baseUrl: aBaseUrl,
						authMode: "token",
						token: "token-a",
					},
					"gotify.state": {
						status: "connected",
						lastProcessedMessageId: 3,
						notificationsInitialized: true,
						recentMessages: [],
						unreadCount: 1,
					},
				});
			}, mockA.baseUrl);
			mockA.addMessage({
				appid: 1,
				title: "A-migrated-live",
				message: "after migration",
				priority: 5,
			});

			try {
				await serviceWorker.evaluate(() => chrome.runtime.reload());
			} catch {
				// the worker dies mid-evaluate; expected
			}
			serviceWorker = await context.waitForEvent("serviceworker", {
				timeout: 20_000,
			});
			await wait(2_000);

			const legacyConfig = await readStorage("gotify.config");
			assert(legacyConfig === null, "gotify.config should be removed");
			const servers = await readStorage<Array<{ baseUrl: string; id: string }>>(
				"gotify.servers",
			);
			assert(servers !== null && servers.length === 1, "migration produced no server");
			assert(
				servers[0].baseUrl === mockA.baseUrl,
				"migrated server has the legacy baseUrl",
			);
			const state = await readStorage<{ serverOrder: string[] }>("gotify.state");
			assert(
				state.serverOrder.length === 1 && state.serverOrder[0] === servers[0].id,
				"state wrapper should carry the migrated slice",
			);
			return "legacy keys wrapped into gotify.servers";
		});

		await check("S11b migrated server works in the UI and polls", async () => {
			// Force a sync to find out whether the post-migration init sync ran.
			// Self-send from the SW has no receiver without open pages; that is
			// fine, the markers carry the diagnosis.
			const forcedSync = await serviceWorker
				.evaluate(async () => {
					try {
						return await chrome.runtime.sendMessage({ type: "gotify/sync" });
					} catch (error) {
						return { ok: false, error: String(error) };
					}
				})
				.catch((error: unknown) => ({ ok: false, error: String(error) }));
			// chrome.runtime.reload() closed the old extension pages; open a new one.
			const page3 = await context.newPage();
			await page3.goto(optionsUrl);
			try {
				await page3
					.getByText("A-migrated-live")
					.first()
					.waitFor({ timeout: 15_000 });
			} catch (error) {
				const loginForm = await page3.getByLabel("Gotify URL").count();
				const state = await readStorage<{
					serverOrder: string[];
					servers: Record<
						string,
						{
							config?: { baseUrl: string };
							status?: string;
							error?: string;
							lastSyncAt?: number;
							lastProcessedMessageId?: number;
						}
					>;
				}>("gotify.state");
				const stored = await readStorage<
					Array<{ baseUrl: string; pollIntervalSeconds?: number }>
				>("gotify.servers");
				const dump = JSON.stringify({
					loginForm,
					forcedSyncOk: forcedSync?.ok,
					forcedSyncError: forcedSync?.error,
					debugMarkers: await serviceWorker.evaluate(async () => {
						const all = await chrome.storage.local.get(null);
						return Object.fromEntries(
							Object.entries(all).filter(([key]) => key.startsWith("debug.")),
						);
					}),
					dynamicRules: await serviceWorker.evaluate(async () =>
						(
							await chrome.declarativeNetRequest.getDynamicRules()
						).map((rule: { id: number }) => rule.id),
					),
					serverOrder: state.serverOrder,
					storedServers: stored,
					slices: Object.entries(state.servers).map(([id, slice]) => ({
						id: id.slice(0, 8),
						baseUrl: slice.config?.baseUrl,
						status: slice.status,
						error: slice.error,
						lastSyncAt: slice.lastSyncAt,
						cursor: slice.lastProcessedMessageId,
					})),
				});
				throw new Error(`${(error as Error).message} — diagnostics: ${dump}`);
			}
			await page3.getByText("localhost:8801").first().waitFor({ timeout: 5_000 });
			return "migrated server visible with live-polled message";
		});
	} finally {
		await context.close();
		await Promise.all(mocks.map((mock) => mock.stop()));
	}

	console.log("");
	console.log(`E2E result: ${results.length - failures}/${results.length} passed`);
	if (failures > 0) {
		process.exit(1);
	}
};

main().catch((error) => {
	console.error("E2E crashed:", error);
	process.exit(1);
});
