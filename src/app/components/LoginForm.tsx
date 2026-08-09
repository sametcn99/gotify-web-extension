import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import type { ChangeEvent, FormEvent } from "react";

interface LoginFormProps {
	baseUrl: string;
	token: string;
	submitting: boolean;
	onBaseUrlChange: (url: string) => void;
	onTokenChange: (token: string) => void;
	onSubmit: () => void;
}

export const LoginForm = ({
	baseUrl,
	token,
	submitting,
	onBaseUrlChange,
	onTokenChange,
	onSubmit,
}: LoginFormProps) => {
	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		onSubmit();
	};

	return (
		<Box sx={{ maxWidth: 400, mx: "auto" }}>
			<Typography variant="h4" sx={{ mb: 3 }}>
				Login
			</Typography>
			<Paper elevation={6} sx={{ p: 2 }}>
				<Box component="form" onSubmit={handleSubmit}>
					<TextField
						autoFocus
						label="Gotify URL"
						value={baseUrl}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							onBaseUrlChange(event.target.value)
						}
						placeholder="https://gotify.example.com"
						autoComplete="url"
						margin="dense"
						fullWidth
					/>
					<TextField
						label="Client token"
						value={token}
						onChange={(event: ChangeEvent<HTMLInputElement>) =>
							onTokenChange(event.target.value)
						}
						autoComplete="off"
						margin="normal"
						fullWidth
					/>
					<Typography variant="caption" color="text.secondary">
						Create a client in Gotify and paste its token here.
					</Typography>
					<Button
						type="submit"
						variant="contained"
						size="large"
						fullWidth
						disabled={submitting}
						sx={{ mt: 1.5 }}
					>
						{submitting ? "Connecting..." : "Login"}
					</Button>
				</Box>
			</Paper>
		</Box>
	);
};
