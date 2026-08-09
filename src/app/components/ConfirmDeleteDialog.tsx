import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	Typography,
} from "@mui/material";
import type { GotifyApplication } from "../../shared/types";

interface ConfirmDeleteDialogProps {
	open: boolean;
	submitting: boolean;
	selectedApplication?: GotifyApplication;
	onClose: () => void;
	onConfirm: () => void;
}

export const ConfirmDeleteDialog = ({
	open,
	submitting,
	selectedApplication,
	onClose,
	onConfirm,
}: ConfirmDeleteDialogProps) => {
	return (
		<Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
			<DialogTitle>Confirm Delete</DialogTitle>
			<DialogContent>
				<Typography>
					Delete all messages
					{selectedApplication ? ` from ${selectedApplication.name}` : ""}?
				</Typography>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				<Button
					color="error"
					variant="contained"
					onClick={onConfirm}
					disabled={submitting}
				>
					Delete All
				</Button>
			</DialogActions>
		</Dialog>
	);
};
