import {
	Box,
	Button,
	Checkbox,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	FormControlLabel,
	List,
	ListItem,
	Radio,
	RadioGroup,
	Stack,
	Switch,
	Typography,
} from "@mui/material";
import { enqueueSnackbar } from "notistack";
import { useEffect, useMemo, useState } from "react";
import type { GotifyApplication, GotifyMessage } from "../../shared/types";
import {
	buildExportFilename,
	downloadTextFile,
	EXPORT_MIME_TYPES,
	type ExportFormat,
	messagesToCsv,
	messagesToJson,
} from "../export";
import { filterMessages, sortMessages } from "../message-view";

interface ExportDialogProps {
	open: boolean;
	/** All messages of the active server/application scope. */
	messages: GotifyMessage[];
	applications?: Record<string, GotifyApplication>;
	applicationList: GotifyApplication[];
	/** Sidebar selection to pre-check when the dialog opens. */
	selectedApplicationId?: number;
	hostname: string;
	baseUrl: string;
	searchText: string;
	onClose: () => void;
}

export const ExportDialog = ({
	open,
	messages,
	applications,
	applicationList,
	selectedApplicationId,
	hostname,
	baseUrl,
	searchText,
	onClose,
}: ExportDialogProps) => {
	const [format, setFormat] = useState<ExportFormat>("csv");
	const [allApplications, setAllApplications] = useState(true);
	const [selectedAppIds, setSelectedAppIds] = useState<Set<number>>(new Set());
	const [onlyMatching, setOnlyMatching] = useState(true);

	// Reset the draft each time the dialog opens instead of on every prop
	// change, mirroring the settings-draft hydration pattern.
	useEffect(() => {
		if (!open) return;
		setFormat("csv");
		setAllApplications(selectedApplicationId === undefined);
		setSelectedAppIds(
			selectedApplicationId === undefined
				? new Set()
				: new Set([selectedApplicationId]),
		);
		setOnlyMatching(true);
	}, [open, selectedApplicationId]);

	const filtersActive = searchText.trim().length > 0;

	const exportMessages = useMemo(() => {
		const scoped = allApplications
			? messages
			: messages.filter((message) => selectedAppIds.has(message.appid));
		const filtered =
			filtersActive && onlyMatching
				? filterMessages(scoped, applications, { searchText })
				: scoped;
		return sortMessages(filtered, "newest");
	}, [
		allApplications,
		messages,
		selectedAppIds,
		applications,
		filtersActive,
		onlyMatching,
		searchText,
	]);

	const scopeLabel = allApplications
		? "all"
		: selectedAppIds.size === 1
			? (applicationList.find((app) => app.id === [...selectedAppIds][0])
					?.name ?? "app")
			: "selected-apps";

	const handleExport = () => {
		const filename = buildExportFilename(hostname, scopeLabel, format);
		const content =
			format === "csv"
				? messagesToCsv(exportMessages, applications)
				: messagesToJson(exportMessages, applications, {
						name: hostname,
						url: baseUrl,
					});
		downloadTextFile(filename, content, EXPORT_MIME_TYPES[format]);
		enqueueSnackbar({
			message: `Exported ${exportMessages.length} message${exportMessages.length === 1 ? "" : "s"} to ${filename}`,
			variant: "success",
		});
		onClose();
	};

	return (
		<Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
			<DialogTitle>Export messages</DialogTitle>
			<DialogContent>
				<Stack spacing={2} sx={{ pt: 1 }}>
					<Box>
						<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
							Format
						</Typography>
						<RadioGroup
							row
							value={format}
							onChange={(event) =>
								setFormat(event.target.value as ExportFormat)
							}
						>
							<FormControlLabel value="csv" control={<Radio />} label="CSV" />
							<FormControlLabel value="json" control={<Radio />} label="JSON" />
						</RadioGroup>
					</Box>
					<Box>
						<Typography variant="subtitle2" sx={{ mb: 0.5 }}>
							Applications
						</Typography>
						<FormControlLabel
							control={
								<Checkbox
									checked={allApplications}
									onChange={(event) => setAllApplications(event.target.checked)}
								/>
							}
							label="All applications"
						/>
						{!allApplications && (
							<List dense disablePadding sx={{ pl: 3 }}>
								{applicationList.map((application) => (
									<ListItem key={application.id} disableGutters>
										<FormControlLabel
											control={
												<Checkbox
													checked={selectedAppIds.has(application.id)}
													onChange={(event) => {
														setSelectedAppIds((current) => {
															const next = new Set(current);
															if (event.target.checked) {
																next.add(application.id);
															} else {
																next.delete(application.id);
															}
															return next;
														});
													}}
												/>
											}
											label={application.name}
										/>
									</ListItem>
								))}
							</List>
						)}
					</Box>
					{filtersActive && (
						<FormControlLabel
							control={
								<Switch
									checked={onlyMatching}
									onChange={(event) => setOnlyMatching(event.target.checked)}
								/>
							}
							label="Only messages matching current filters"
						/>
					)}
					<Typography variant="body2" color="text.secondary">
						{`${exportMessages.length} message${exportMessages.length === 1 ? "" : "s"} will be exported`}
					</Typography>
				</Stack>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose}>Cancel</Button>
				<Button
					variant="contained"
					onClick={handleExport}
					disabled={exportMessages.length === 0}
				>
					Export
				</Button>
			</DialogActions>
		</Dialog>
	);
};
