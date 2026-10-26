import Delete from "@mui/icons-material/Delete";
import {
	Avatar,
	Box,
	Button,
	IconButton,
	Paper,
	Stack,
	Tooltip,
	Typography,
} from "@mui/material";
import Linkify from "linkify-react";
import type { GotifyApplication, GotifyMessage } from "../../shared/types";
import { MESSAGE_PREVIEW_LENGTH } from "../constants";
import { useDateFormat } from "../hooks/useDateFormat";
import {
	formatExtras,
	formatMessageDate,
	getImageUrl,
	priorityColor,
} from "../utils";

interface MessageCardProps {
	message: GotifyMessage;
	baseUrl: string;
	applications?: Record<string, GotifyApplication>;
	expanded: boolean;
	submitting: boolean;
	onToggleExpand: (id: number) => void;
	onDelete: (id: number) => void;
}

export const MessageCard = ({
	message,
	baseUrl,
	applications,
	expanded,
	submitting,
	onToggleExpand,
	onDelete,
}: MessageCardProps) => {
	const body = message.message || "(empty message)";
	const isLong = body.length > MESSAGE_PREVIEW_LENGTH;
	const application = applications?.[String(message.appid)];
	const applicationName = application?.name ?? `App ${message.appid}`;
	const { dateFormat } = useDateFormat();

	return (
		<Paper
			elevation={4}
			sx={{
				p: 2,
				borderLeft: `6px solid ${priorityColor(message.priority)}`,
			}}
		>
			<Stack spacing={1}>
				<Stack direction="row" spacing={1.5} sx={{ alignItems: "flex-start" }}>
					<Avatar
						src={getImageUrl(baseUrl, application?.image)}
						alt={`${applicationName} logo`}
						variant="square"
						sx={{ width: 50, height: 50, flexShrink: 0 }}
					>
						{applicationName.charAt(0).toUpperCase()}
					</Avatar>
					<Box sx={{ flex: 1, minWidth: 0 }}>
						<Typography
							variant="h5"
							sx={{
								lineHeight: 1.2,
								wordBreak: "break-all",
							}}
						>
							{message.title || "(no title)"}
						</Typography>
						<Typography
							variant="subtitle1"
							color="text.secondary"
							sx={{ fontSize: 12 }}
						>
							{applicationName}
						</Typography>
					</Box>
					<Typography
						variant="body2"
						color="text.secondary"
						sx={{ whiteSpace: "nowrap" }}
					>
						{formatMessageDate(message.date, dateFormat)}
					</Typography>
					<Tooltip title="Delete message" arrow>
						<IconButton
							onClick={() => onDelete(message.id)}
							disabled={submitting}
							aria-label="Delete message"
						>
							<Delete />
						</IconButton>
					</Tooltip>
				</Stack>
				<Typography
					variant="body1"
					sx={{
						whiteSpace: "pre-wrap",
						wordBreak: "break-word",
						"& a, & a:visited": {
							color: "primary.main",
							fontWeight: 500,
							textDecorationColor: "currentColor",
							textUnderlineOffset: "2px",
						},
						"& a:hover": {
							color: "primary.dark",
						},
						"& a:focus-visible": {
							borderRadius: 0.5,
							outline: "2px solid",
							outlineColor: "primary.main",
							outlineOffset: "2px",
						},
					}}
				>
					<Linkify options={{ target: "_blank", rel: "noopener noreferrer" }}>
						{isLong && !expanded
							? `${body.slice(0, MESSAGE_PREVIEW_LENGTH)}...`
							: body}
					</Linkify>
				</Typography>
				{isLong && (
					<Button
						variant="contained"
						fullWidth
						onClick={() => onToggleExpand(message.id)}
					>
						{expanded ? "Read Less" : "Read More"}
					</Button>
				)}
				{formatExtras(message.extras) && (
					<Box
						component="pre"
						sx={{
							m: 0,
							p: 1,
							borderRadius: 1,
							backgroundColor: "action.hover",
							overflow: "auto",
							fontSize: "0.75rem",
						}}
					>
						{formatExtras(message.extras)}
					</Box>
				)}
			</Stack>
		</Paper>
	);
};
