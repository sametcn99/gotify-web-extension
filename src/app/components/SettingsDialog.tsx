import {
	Box,
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	Stack,
	Switch,
	TextField,
	Typography,
} from "@mui/material";
import type { GotifyApplication } from "../../shared/types";
import {
	MAX_POLL_INTERVAL_SECONDS,
	MIN_POLL_INTERVAL_SECONDS,
} from "../constants";

interface SettingsDialogProps {
	open: boolean;
	submitting: boolean;
	pollIntervalSeconds: string;
	quietHoursEnabled: boolean;
	quietHoursStart: string;
	quietHoursEnd: string;
	disabledApplicationIds: number[];
	applications: GotifyApplication[];
	onClose: () => void;
	onSave: () => void;
	onPollIntervalChange: (value: string) => void;
	onQuietHoursEnabledChange: (enabled: boolean) => void;
	onQuietHoursStartChange: (start: string) => void;
	onQuietHoursEndChange: (end: string) => void;
	onDisabledApplicationIdsChange: (
		updater: (current: number[]) => number[],
	) => void;
}

export const SettingsDialog = ({
	open,
	submitting,
	pollIntervalSeconds,
	quietHoursEnabled,
	quietHoursStart,
	quietHoursEnd,
	disabledApplicationIds,
	applications,
	onClose,
	onSave,
	onPollIntervalChange,
	onQuietHoursEnabledChange,
	onQuietHoursStartChange,
	onQuietHoursEndChange,
	onDisabledApplicationIdsChange,
}: SettingsDialogProps) => {
	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
			<DialogTitle>Settings</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
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
