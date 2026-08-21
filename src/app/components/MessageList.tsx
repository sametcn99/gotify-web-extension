import {
	Box,
	Button,
	CircularProgress,
	Stack,
	Typography,
} from "@mui/material";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import type { GotifyApplication, GotifyMessage } from "../../shared/types";
import { MessageCard } from "./MessageCard";

const MESSAGE_ROW_GAP = 16;
const ESTIMATED_MESSAGE_HEIGHT = 220;

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
	const listRef = useRef<HTMLDivElement>(null);

	const virtualizer = useWindowVirtualizer({
		count: messages.length,
		estimateSize: () => ESTIMATED_MESSAGE_HEIGHT,
		overscan: 6,
		gap: MESSAGE_ROW_GAP,
		scrollMargin: listRef.current?.offsetTop ?? 0,
		getItemKey: (index) => messages[index].id,
	});

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
				spacing={1}
				sx={{ alignItems: { xs: "stretch", sm: "center" }, mb: 3 }}
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
				<Typography variant="caption" align="center" sx={{ display: "block" }}>
					No messages
				</Typography>
			) : (
				<Box
					ref={listRef}
					sx={{
						position: "relative",
						width: "100%",
						height: virtualizer.getTotalSize(),
					}}
				>
					{virtualizer.getVirtualItems().map((virtualItem) => {
						const message = messages[virtualItem.index];
						return (
							<Box
								key={virtualItem.key}
								data-index={virtualItem.index}
								ref={virtualizer.measureElement}
								sx={{
									position: "absolute",
									top: 0,
									left: 0,
									width: "100%",
									transform: `translateY(${virtualItem.start - virtualizer.options.scrollMargin}px)`,
								}}
							>
								<MessageCard
									message={message}
									baseUrl={baseUrl}
									applications={applications}
									expanded={expandedMessageIds.has(message.id)}
									submitting={submitting}
									onToggleExpand={handleToggleExpand}
									onDelete={onDeleteMessage}
								/>
							</Box>
						);
					})}
				</Box>
			)}
		</Box>
	);
};
