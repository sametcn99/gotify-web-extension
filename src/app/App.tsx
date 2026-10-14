import "@fontsource/roboto";
import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { SnackbarProvider } from "notistack";
import { useEffect, useState } from "react";
import { AddServerDialog } from "./components/AddServerDialog";
import { ConfirmDeleteDialog } from "./components/ConfirmDeleteDialog";
import { Header } from "./components/Header";
import { LoginForm } from "./components/LoginForm";
import { MessageList } from "./components/MessageList";
import { SettingsDialog } from "./components/SettingsDialog";
import { Sidebar } from "./components/Sidebar";
import {
	MAX_POLL_INTERVAL_SECONDS,
	MIN_POLL_INTERVAL_SECONDS,
} from "./constants";
import { useGotify } from "./hooks/useGotify";
import { useThemeMode } from "./hooks/useThemeMode";
import { serverHostname } from "./utils";

const App = () => {
	const {
		state,
		activeServerId,
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
	} = useGotify();

	const { themeMode, theme, toggleTheme, themeIcon } = useThemeMode();

	const [settingsOpen, setSettingsOpen] = useState(false);
	const [deleteAllOpen, setDeleteAllOpen] = useState(false);
	const [addServerOpen, setAddServerOpen] = useState(false);
	const [navOpen, setNavOpen] = useState(false);
	const [selectedApplicationId, setSelectedApplicationId] = useState<number>();
	const [confirmRemoveServerId, setConfirmRemoveServerId] = useState<string>();

	const authenticated = serverList.length > 0;
	const activeBaseUrl = activeServerState?.config?.baseUrl ?? "";
	const applicationList = Object.values(
		activeServerState?.applications ?? {},
	).sort((a, b) => a.name.localeCompare(b.name));
	// A selection from another server is ignored instead of being reset, so
	// switching back and forth preserves each server's application filter.
	const applicationIds = new Set(applicationList.map((app) => app.id));
	const effectiveSelectedApplicationId =
		selectedApplicationId !== undefined &&
		applicationIds.has(selectedApplicationId)
			? selectedApplicationId
			: undefined;
	const selectedApplication =
		effectiveSelectedApplicationId === undefined
			? undefined
			: activeServerState?.applications?.[
					String(effectiveSelectedApplicationId)
				];

	useEffect(() => {
		if (authenticated && activeServerId) {
			void loadMessages(activeServerId, effectiveSelectedApplicationId);
		}
	}, [
		authenticated,
		activeServerId,
		loadMessages,
		effectiveSelectedApplicationId,
	]);

	const handleRefresh = async () => {
		if (activeServerId) {
			await loadMessages(activeServerId, effectiveSelectedApplicationId);
		}
	};

	const handleSaveSettings = () => {
		const seconds = Number(pollIntervalSeconds);
		if (
			!Number.isInteger(seconds) ||
			seconds < MIN_POLL_INTERVAL_SECONDS ||
			seconds > MAX_POLL_INTERVAL_SECONDS
		) {
			return showError(
				`Polling interval must be between ${MIN_POLL_INTERVAL_SECONDS} and ${MAX_POLL_INTERVAL_SECONDS} seconds`,
			);
		}
		void saveSettings(() => setSettingsOpen(false));
	};

	const serverPendingRemoval =
		confirmRemoveServerId === undefined
			? undefined
			: serverList.find((server) => server.id === confirmRemoveServerId);

	return (
		<ThemeProvider theme={theme}>
			<SnackbarProvider>
				<CssBaseline />
				<Header
					authenticated={authenticated}
					servers={serverList}
					activeServerId={activeServerId}
					messagesLoading={messagesLoading}
					submitting={submitting}
					themeMode={themeMode}
					themeIcon={themeIcon}
					updateInfo={state.updateInfo}
					onToggleNav={() => setNavOpen((prev) => !prev)}
					onSelectServer={setActiveServer}
					onAddServer={() => setAddServerOpen(true)}
					onRefresh={() => void handleRefresh()}
					onOpenSettings={() => setSettingsOpen(true)}
					onLogout={() => setConfirmRemoveServerId(activeServerId)}
					onToggleTheme={toggleTheme}
				/>

				<Box
					component="main"
					sx={{
						pt: { xs: 8, sm: 11 },
						px: { xs: 1.5, sm: 3 },
						pb: 3,
						ml: authenticated ? { xs: 0, sm: "250px" } : 0,
						width: authenticated
							? { xs: "100%", sm: "calc(100% - 250px)" }
							: "100%",
					}}
				>
					{!authenticated ? (
						<LoginForm
							baseUrl={baseUrl}
							token={token}
							submitting={submitting}
							onBaseUrlChange={setBaseUrl}
							onTokenChange={setToken}
							onSubmit={() => void addServer({ baseUrl, token })}
						/>
					) : (
						<Box
							sx={{
								maxWidth: 700,
								mx: "auto",
							}}
						>
							<Sidebar
								baseUrl={activeBaseUrl}
								applications={applicationList}
								selectedApplicationId={effectiveSelectedApplicationId}
								mobileOpen={navOpen}
								onCloseMobile={() => setNavOpen(false)}
								onSelectApplication={setSelectedApplicationId}
							/>
							<MessageList
								selectedApplication={selectedApplication}
								baseUrl={activeBaseUrl}
								messages={messages}
								applications={activeServerState?.applications}
								loading={loading}
								messagesLoading={messagesLoading}
								submitting={submitting}
								onRefresh={() => void handleRefresh()}
								onDeleteAllOpen={() => setDeleteAllOpen(true)}
								onDeleteMessage={(id) => void deleteMessage(id)}
							/>
						</Box>
					)}
				</Box>

				<AddServerDialog
					open={addServerOpen}
					submitting={submitting}
					onClose={() => setAddServerOpen(false)}
					onSubmit={(url, serverToken) =>
						void addServer({ baseUrl: url, token: serverToken }, () =>
							setAddServerOpen(false),
						)
					}
				/>

				<SettingsDialog
					open={authenticated && settingsOpen}
					submitting={submitting}
					servers={serverList}
					activeServerId={activeServerId}
					pollIntervalSeconds={pollIntervalSeconds}
					quietHoursEnabled={quietHoursEnabled}
					quietHoursStart={quietHoursStart}
					quietHoursEnd={quietHoursEnd}
					disabledApplicationIds={disabledApplicationIds}
					applications={applicationList}
					onClose={() => setSettingsOpen(false)}
					onSave={handleSaveSettings}
					onAddServer={() => {
						setSettingsOpen(false);
						setAddServerOpen(true);
					}}
					onRemoveServer={(serverId) => setConfirmRemoveServerId(serverId)}
					onPollIntervalChange={setPollIntervalSeconds}
					onQuietHoursEnabledChange={setQuietHoursEnabled}
					onQuietHoursStartChange={setQuietHoursStart}
					onQuietHoursEndChange={setQuietHoursEnd}
					onDisabledApplicationIdsChange={setDisabledApplicationIds}
				/>

				<ConfirmDeleteDialog
					open={deleteAllOpen}
					submitting={submitting}
					selectedApplication={selectedApplication}
					onClose={() => setDeleteAllOpen(false)}
					onConfirm={() =>
						void deleteAllMessages(effectiveSelectedApplicationId, () =>
							setDeleteAllOpen(false),
						)
					}
				/>

				<ConfirmDeleteDialog
					open={confirmRemoveServerId !== undefined}
					submitting={submitting}
					title="Remove server"
					description={
						serverPendingRemoval
							? `Remove ${serverHostname(serverPendingRemoval.baseUrl)} and its stored token? Messages on the server are not deleted.`
							: undefined
					}
					confirmLabel="Remove"
					onClose={() => setConfirmRemoveServerId(undefined)}
					onConfirm={() => {
						if (confirmRemoveServerId === undefined) return;
						void removeServer(confirmRemoveServerId, () => {
							setConfirmRemoveServerId(undefined);
							setSettingsOpen(false);
						});
					}}
				/>
			</SnackbarProvider>
		</ThemeProvider>
	);
};

export default App;
