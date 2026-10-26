import Clear from "@mui/icons-material/Clear";
import FileDownload from "@mui/icons-material/FileDownload";
import Search from "@mui/icons-material/Search";
import {
	Box,
	Button,
	CircularProgress,
	InputAdornment,
	MenuItem,
	Select,
	Stack,
	TextField,
	Typography,
} from "@mui/material";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRef, useState } from "react";
import type { GotifyApplication, GotifyMessage } from "../../shared/types";
import type { SortOrder } from "../message-view";
import { MessageCard } from "./MessageCard";

const MESSAGE_ROW_GAP = 16;
const ESTIMATED_MESSAGE_HEIGHT = 220;

export const SORT_ORDER_LABELS: Record<SortOrder, string> = {
	newest: "Newest first",
	oldest: "Oldest first",
	priority: "Priority (high → low)",
};

interface MessageListProps {
	selectedApplication?: GotifyApplication;
	baseUrl: string;
	/** Already filtered and sorted by the parent. */
	messages: GotifyMessage[];
	/** Count of messages in the current server/application scope, unfiltered. */
	totalCount: number;
	applications?: Record<string, GotifyApplication>;
	loading: boolean;
	messagesLoading: boolean;
	submitting: boolean;
	searchText: string;
	sortOrder: SortOrder;
	onSearchTextChange: (value: string) => void;
	onSortOrderChange: (order: SortOrder) => void;
	onRefresh: () => void;
	onDeleteAllOpen: () => void;
	onExportOpen: () => void;
	onDeleteMessage: (id: number) => void;
}

export const MessageList = ({
	selectedApplication,
	baseUrl,
	messages,
	totalCount,
	applications,
	loading,
	messagesLoading,
	submitting,
	searchText,
	sortOrder,
	onSearchTextChange,
	onSortOrderChange,
	onRefresh,
	onDeleteAllOpen,
	onExportOpen,
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

	const filtersActive = searchText.trim().length > 0;

	return (
		<Box>
			<Stack
				direction={{ xs: "column", sm: "row" }}
				spacing={1}
				sx={{ alignItems: { xs: "stretch", sm: "center" }, mb: 2 }}
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
						disabled={totalCount === 0 || submitting}
					>
						Delete All
					</Button>
				</Stack>
			</Stack>
			<Stack
				direction={{ xs: "column", sm: "row" }}
				spacing={1}
				sx={{
					alignItems: { xs: "stretch", sm: "center" },
					flexWrap: { sm: "wrap" },
					mb: 1,
				}}
			>
				<TextField
					size="small"
					placeholder="Search messages"
					// On the native input via htmlInput so getByLabel/fill resolve
					// to the input, not the FormControl wrapper.
					slotProps={{
						htmlInput: { "aria-label": "Search messages" },
						input: {
							startAdornment: (
								<InputAdornment position="start">
									<Search fontSize="small" />
								</InputAdornment>
							),
							endAdornment: searchText ? (
								<InputAdornment position="end">
									<Button
										size="small"
										aria-label="Clear search"
										onClick={() => onSearchTextChange("")}
									>
										<Clear fontSize="small" />
									</Button>
								</InputAdornment>
							) : undefined,
						},
					}}
					value={searchText}
					onChange={(event) => onSearchTextChange(event.target.value)}
					sx={{ flexGrow: 1, minWidth: { sm: 180 }, mb: { xs: 1, sm: 0 } }}
				/>
				<Select
					size="small"
					value={sortOrder}
					onChange={(event) =>
						onSortOrderChange(event.target.value as SortOrder)
					}
					inputProps={{ "aria-label": "Sort messages" }}
					sx={{ minWidth: 170 }}
				>
					{(Object.keys(SORT_ORDER_LABELS) as SortOrder[]).map((order) => (
						<MenuItem key={order} value={order}>
							{SORT_ORDER_LABELS[order]}
						</MenuItem>
					))}
				</Select>
				<Button
					variant="outlined"
					startIcon={<FileDownload />}
					onClick={onExportOpen}
					disabled={totalCount === 0}
				>
					Export
				</Button>
			</Stack>
			{filtersActive && (
				<Typography
					variant="caption"
					color="text.secondary"
					sx={{ display: "block", mb: 2 }}
				>
					{`Showing ${messages.length} of ${totalCount} messages`}
				</Typography>
			)}
			{messagesLoading || loading ? (
				<CircularProgress
					size={40}
					sx={{ display: "block", mx: "auto", my: 5 }}
				/>
			) : totalCount === 0 ? (
				<Typography variant="caption" align="center" sx={{ display: "block" }}>
					No messages
				</Typography>
			) : messages.length === 0 ? (
				<Typography variant="caption" align="center" sx={{ display: "block" }}>
					No messages match your filters
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
