import "@fontsource/roboto";
import { Box, CssBaseline, ThemeProvider } from "@mui/material";
import { SnackbarProvider } from "notistack";
import { useEffect, useState } from "react";
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

const App = () => {
	const {
		state,
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
		login,
		logout,
		saveSettings,
		deleteMessage,
		deleteAllMessages,
		showError,
	} = useGotify();

	const { themeMode, theme, toggleTheme, themeIcon } = useThemeMode();

	const [settingsOpen, setSettingsOpen] = useState(false);
	const [deleteAllOpen, setDeleteAllOpen] = useState(false);
	const [navOpen, setNavOpen] = useState(false);
	const [selectedApplicationId, setSelectedApplicationId] = useState<number>();

	const authenticated = Boolean(state.config);
	const applicationList = Object.values(state.applications ?? {}).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
	const selectedApplication =
		selectedApplicationId === undefined
			? undefined
			: state.applications?.[String(selectedApplicationId)];

	useEffect(() => {
		if (authenticated) void loadMessages(selectedApplicationId);
	}, [authenticated, loadMessages, selectedApplicationId]);

	const handleRefresh = async () => {
		await loadMessages(selectedApplicationId);
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

	return (
		<ThemeProvider theme={theme}>
			<SnackbarProvider>
				<CssBaseline />
				<Header
					authenticated={authenticated}
					messagesLoading={messagesLoading}
					submitting={submitting}
					themeMode={themeMode}
					themeIcon={themeIcon}
					onToggleNav={() => setNavOpen((prev) => !prev)}
					onRefresh={() => void handleRefresh()}
					onOpenSettings={() => setSettingsOpen(true)}
					onLogout={() => void logout(() => setSettingsOpen(false))}
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
							onSubmit={() => void login()}
						/>
					) : (
						<Box
							sx={{
								maxWidth: 700,
								mx: "auto",
							}}
						>
							<Sidebar
								baseUrl={baseUrl}
								applications={applicationList}
								selectedApplicationId={selectedApplicationId}
								mobileOpen={navOpen}
								onCloseMobile={() => setNavOpen(false)}
								onSelectApplication={setSelectedApplicationId}
							/>
							<MessageList
								selectedApplication={selectedApplication}
								baseUrl={baseUrl}
								messages={messages}
								applications={state.applications}
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

				<SettingsDialog
					open={authenticated && settingsOpen}
					submitting={submitting}
					pollIntervalSeconds={pollIntervalSeconds}
					quietHoursEnabled={quietHoursEnabled}
					quietHoursStart={quietHoursStart}
					quietHoursEnd={quietHoursEnd}
					disabledApplicationIds={disabledApplicationIds}
					applications={applicationList}
					onClose={() => setSettingsOpen(false)}
					onSave={handleSaveSettings}
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
						void deleteAllMessages(selectedApplicationId, () =>
							setDeleteAllOpen(false),
						)
					}
				/>
			</SnackbarProvider>
		</ThemeProvider>
	);
};

export default App;
