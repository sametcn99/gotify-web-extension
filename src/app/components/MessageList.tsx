import {
	Box,
	Button,
	CircularProgress,
	Stack,
	Typography,
} from "@mui/material";
import { useState } from "react";
import type { GotifyApplication, GotifyMessage } from "../../shared/types";
import { MessageCard } from "./MessageCard";

interface MessageListProps {
	selectedApplication?: GotifyApplication;
	baseUrl: string;
	messages: GotifyMessage[];
	applications?: Record<string, GotifyApplication>;
	loading: boolean;
	messagesLoading: boolean;
	submitting: boolean;
	onRefresh: () => void;
	onDeleteAllOpen: () => void;
	onDeleteMessage: (id: number) => void;
}

export const MessageList = ({
	selectedApplication,
	baseUrl,
	messages,
	applications,
	loading,
	messagesLoading,
	submitting,
	onRefresh,
	onDeleteAllOpen,
	onDeleteMessage,
}: MessageListProps) => {
	const [expandedMessageIds, setExpandedMessageIds] = useState<Set<number>>(
		new Set(),
	);

	const handleToggleExpand = (id: number) => {
		setExpandedMessageIds((current) => {
			const next = new Set(current);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	};

	return (
		<Box>
			<Stack
				direction={{ xs: "column", sm: "row" }}
				alignItems={{ xs: "stretch", sm: "center" }}
				spacing={1}
				sx={{ mb: 3 }}
			>
				<Typography variant="h4" sx={{ flex: 1 }}>
					{selectedApplication?.name ?? "All Messages"}
				</Typography>
				<Stack
					direction="row"
					spacing={1}
					sx={{ ml: { sm: "auto" }, alignSelf: { xs: "flex-end", sm: "auto" } }}
				>
					<Button
						variant="contained"
						onClick={onRefresh}
						disabled={messagesLoading || submitting}
					>
						Refresh
					</Button>
					<Button
						variant="contained"
						color="error"
						onClick={onDeleteAllOpen}
						disabled={messages.length === 0 || submitting}
					>
						Delete All
					</Button>
				</Stack>
			</Stack>
			{messagesLoading || loading ? (
				<CircularProgress
					size={40}
					sx={{ display: "block", mx: "auto", my: 5 }}
				/>
			) : messages.length === 0 ? (
				<Typography variant="caption" display="block" align="center">
					No messages
				</Typography>
			) : (
				<Stack spacing={2}>
					{messages.map((message) => (
						<MessageCard
							key={message.id}
							message={message}
							baseUrl={baseUrl}
							applications={applications}
							expanded={expandedMessageIds.has(message.id)}
							submitting={submitting}
							onToggleExpand={handleToggleExpand}
							onDelete={onDeleteMessage}
						/>
					))}
				</Stack>
			)}
		</Box>
	);
};
