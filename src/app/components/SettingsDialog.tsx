import DeleteOutlined from "@mui/icons-material/DeleteOutlined";
import {
	Box,
	Button,
	Checkbox,
	Chip,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	IconButton,
	MenuItem,
	Select,
	Stack,
	Switch,
	TextField,
	Tooltip,
	Typography,
} from "@mui/material";
import type { GotifyApplication } from "../../shared/types";
import {
	MAX_POLL_INTERVAL_SECONDS,
	MIN_POLL_INTERVAL_SECONDS,
} from "../constants";
import type { ServerListItem } from "../hooks/useGotify";
import {
	type DateFormatSetting,
	formatMessageDate,
	serverHostname,
} from "../utils";

interface SettingsDialogProps {
	open: boolean;
	submitting: boolean;
	servers: ServerListItem[];
	activeServerId?: string;
	pollIntervalSeconds: string;
	quietHoursEnabled: boolean;
	quietHoursStart: string;
	quietHoursEnd: string;
	disabledApplicationIds: number[];
	applications: GotifyApplication[];
	dateFormat: DateFormatSetting;
	onClose: () => void;
	onSave: () => void;
	onAddServer: () => void;
	onRemoveServer: (serverId: string) => void;
	onPollIntervalChange: (value: string) => void;
	onQuietHoursEnabledChange: (enabled: boolean) => void;
	onQuietHoursStartChange: (start: string) => void;
	onQuietHoursEndChange: (end: string) => void;
	onDisabledApplicationIdsChange: (
		updater: (current: number[]) => number[],
	) => void;
	onDateFormatChange: (setting: DateFormatSetting) => void;
}

const DATE_COMPONENTS = [
	["showDay", "Day"],
	["showMonth", "Month"],
	["showYear", "Year"],
	["showHour", "Hour"],
	["showMinute", "Minute"],
	["showSecond", "Second"],
] as const;

export const SettingsDialog = ({
	open,
	submitting,
	servers,
	activeServerId,
	pollIntervalSeconds,
	quietHoursEnabled,
	quietHoursStart,
	quietHoursEnd,
	disabledApplicationIds,
	applications,
	dateFormat,
	onClose,
	onSave,
	onAddServer,
	onRemoveServer,
	onPollIntervalChange,
	onQuietHoursEnabledChange,
	onQuietHoursStartChange,
	onQuietHoursEndChange,
	onDisabledApplicationIdsChange,
	onDateFormatChange,
}: SettingsDialogProps) => {
	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle>
				Settings
				{activeServerId && servers.length > 1
					? ` — ${serverHostname(
							servers.find((server) => server.id === activeServerId)?.baseUrl ??
								"",
						)}`
					: ""}
			</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Box>
						<Stack
							direction="row"
							sx={{
								justifyContent: "space-between",
								alignItems: "center",
								mb: 0.5,
							}}
						>
							<Typography variant="subtitle2">Servers</Typography>
							<Button size="small" onClick={onAddServer}>
								Add server
							</Button>
						</Stack>
						<Stack spacing={0.5}>
							{servers.map((server) => (
								<Stack
									key={server.id}
									direction="row"
									spacing={1}
									sx={{
										alignItems: "center",
										justifyContent: "space-between",
										px: 1,
										py: 0.5,
										borderRadius: 1,
										bgcolor:
											server.id === activeServerId
												? "action.selected"
												: "transparent",
									}}
								>
									<Stack
										direction="row"
										spacing={1}
										sx={{ alignItems: "center" }}
									>
										<Typography variant="body2">
											{serverHostname(server.baseUrl)}
										</Typography>
										{server.unreadCount > 0 && (
											<Chip
												size="small"
												color="primary"
												label={server.unreadCount}
											/>
										)}
									</Stack>
									<Tooltip title="Remove server" arrow>
										<span>
											<IconButton
												size="small"
												color="error"
												aria-label={`Remove ${serverHostname(server.baseUrl)}`}
												disabled={submitting}
												onClick={() => onRemoveServer(server.id)}
											>
												<DeleteOutlined fontSize="small" />
											</IconButton>
										</span>
									</Tooltip>
								</Stack>
							))}
						</Stack>
					</Box>
					<TextField
						autoFocus
						label="Polling interval (seconds)"
						type="number"
						value={pollIntervalSeconds}
						onChange={(event) => onPollIntervalChange(event.target.value)}
						slotProps={{
							htmlInput: {
								min: MIN_POLL_INTERVAL_SECONDS,
								max: MAX_POLL_INTERVAL_SECONDS,
								step: 1,
							},
						}}
						helperText={`${MIN_POLL_INTERVAL_SECONDS}-${MAX_POLL_INTERVAL_SECONDS} seconds`}
						fullWidth
					/>
					<Box>
						<FormControlLabel
							control={
								<Switch
									checked={quietHoursEnabled}
									onChange={(event) =>
										onQuietHoursEnabledChange(event.target.checked)
									}
								/>
							}
							label="Quiet hours"
						/>
						<Stack direction="row" spacing={1}>
							<TextField
								label="From"
								type="time"
								value={quietHoursStart}
								onChange={(event) =>
									onQuietHoursStartChange(event.target.value)
								}
								slotProps={{ inputLabel: { shrink: true } }}
								disabled={!quietHoursEnabled}
								fullWidth
							/>
							<TextField
								label="To"
								type="time"
								value={quietHoursEnd}
								onChange={(event) => onQuietHoursEndChange(event.target.value)}
								slotProps={{ inputLabel: { shrink: true } }}
								disabled={!quietHoursEnabled}
								fullWidth
							/>
						</Stack>
					</Box>
					<Box>
						<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
							Date display
						</Typography>
						<Select
							fullWidth
							size="small"
							value={dateFormat.mode}
							onChange={(event) =>
								onDateFormatChange({
									...dateFormat,
									mode: event.target.value as DateFormatSetting["mode"],
								})
							}
							inputProps={{ "aria-label": "Date display mode" }}
						>
							<MenuItem value="relative">Relative (e.g. 2 hours ago)</MenuItem>
							<MenuItem value="absolute">Exact date and time</MenuItem>
						</Select>
						{dateFormat.mode === "absolute" && (
							<>
								<Stack
									direction="row"
									sx={{ flexWrap: "wrap", mt: 1, rowGap: 0.5 }}
								>
									{DATE_COMPONENTS.map(([key, label]) => (
										<FormControlLabel
											key={key}
											sx={{ width: "45%" }}
											control={
												<Checkbox
													checked={dateFormat[key]}
													onChange={(event) =>
														onDateFormatChange({
															...dateFormat,
															[key]: event.target.checked,
														} as DateFormatSetting)
													}
												/>
											}
											label={label}
										/>
									))}
								</Stack>
								{dateFormat.showHour && (
									<Select
										fullWidth
										size="small"
										value={dateFormat.hour12 ? "12" : "24"}
										onChange={(event) =>
											onDateFormatChange({
												...dateFormat,
												hour12: event.target.value === "12",
											})
										}
										inputProps={{ "aria-label": "Time notation" }}
										sx={{ mt: 1 }}
									>
										<MenuItem value="24">24-hour</MenuItem>
										<MenuItem value="12">12-hour (AM/PM)</MenuItem>
									</Select>
								)}
								<Typography
									variant="caption"
									color="text.secondary"
									sx={{ display: "block", mt: 1 }}
								>
									{`Preview: ${formatMessageDate(new Date().toISOString(), dateFormat)}`}
								</Typography>
							</>
						)}
						<Typography variant="caption" color="text.secondary">
							Applies instantly to every server (extension-wide).
						</Typography>
					</Box>
					{applications.length > 0 && (
						<Box>
							<Stack
								direction="row"
								sx={{
									justifyContent: "space-between",
									alignItems: "center",
									mb: 0.5,
								}}
							>
								<Typography variant="subtitle2">
									Application notifications
								</Typography>
								<Stack direction="row" spacing={0.5}>
									<Button
										size="small"
										onClick={() => onDisabledApplicationIdsChange(() => [])}
									>
										Enable all
									</Button>
									<Button
										size="small"
										onClick={() =>
											onDisabledApplicationIdsChange(() =>
												applications.map((application) => application.id),
											)
										}
									>
										Disable all
									</Button>
								</Stack>
							</Stack>
							<Box sx={{ maxHeight: 240, overflowY: "auto", pr: 1 }}>
								<Stack>
									{applications.map((application) => (
										<FormControlLabel
											key={application.id}
											control={
												<Switch
													checked={
														!disabledApplicationIds.includes(application.id)
													}
													onChange={(event) =>
														onDisabledApplicationIdsChange((current) =>
															event.target.checked
																? current.filter((id) => id !== application.id)
																: current.includes(application.id)
																	? current
																	: [...current, application.id],
														)
													}
												/>
											}
											label={application.name}
										/>
									))}
								</Stack>
							</Box>
						</Box>
					)}
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				<Button variant="contained" onClick={onSave} disabled={submitting}>
					{submitting ? "Saving..." : "Save settings"}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
