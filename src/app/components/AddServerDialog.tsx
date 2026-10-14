import {
	Button,
	Dialog,
	DialogActions,
	DialogContent,
	DialogTitle,
	TextField,
	Typography,
} from "@mui/material";
import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";

interface AddServerDialogProps {
	open: boolean;
	submitting: boolean;
	onClose: () => void;
	onSubmit: (baseUrl: string, token: string) => void;
}

export const AddServerDialog = ({
	open,
	submitting,
	onClose,
	onSubmit,
}: AddServerDialogProps) => {
	const [baseUrl, setBaseUrl] = useState("");
	const [token, setToken] = useState("");

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		onSubmit(baseUrl, token);
	};

	const handleExited = () => {
		setBaseUrl("");
		setToken("");
	};

	return (
		<Dialog
			open={open}
			onClose={onClose}
			fullWidth
			maxWidth="xs"
			slotProps={{ paper: { component: "form", onSubmit: handleSubmit } }}
			onTransitionExited={handleExited}
		>
			<DialogTitle>Add server</DialogTitle>
			<DialogContent>
				<TextField
					autoFocus
					label="Gotify URL"
					value={baseUrl}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						setBaseUrl(event.target.value)
					}
					placeholder="https://gotify.example.com"
					autoComplete="url"
					margin="dense"
					fullWidth
					disabled={submitting}
				/>
				<TextField
					label="Client token"
					value={token}
					onChange={(event: ChangeEvent<HTMLInputElement>) =>
						setToken(event.target.value)
					}
					autoComplete="off"
					margin="normal"
					fullWidth
					disabled={submitting}
				/>
				<Typography variant="caption" color="text.secondary">
					Create a client in Gotify and paste its token here.
				</Typography>
			</DialogContent>
			<DialogActions>
				<Button onClick={onClose} disabled={submitting}>
					Cancel
				</Button>
				<Button
					type="submit"
					variant="contained"
					disabled={submitting || !baseUrl.trim() || !token.trim()}
				>
					{submitting ? "Connecting..." : "Connect"}
				</Button>
			</DialogActions>
		</Dialog>
	);
};
