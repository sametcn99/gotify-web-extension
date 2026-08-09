import {
	Avatar,
	Divider,
	List,
	ListItemAvatar,
	ListItemButton,
	ListItemText,
} from "@mui/material";
import Drawer from "@mui/material/Drawer";
import type { GotifyApplication } from "../../shared/types";
import { getImageUrl } from "../utils";

interface SidebarProps {
	baseUrl: string;
	applications: GotifyApplication[];
	selectedApplicationId?: number;
	mobileOpen: boolean;
	onCloseMobile: () => void;
	onSelectApplication: (id?: number) => void;
}

export const Sidebar = ({
	baseUrl,
	applications,
	selectedApplicationId,
	mobileOpen,
	onCloseMobile,
	onSelectApplication,
}: SidebarProps) => {
	const drawerContent = (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				minHeight: 0,
				height: "100%",
			}}
		>
			<div
				style={{
					minHeight: 0,
					overflowY: "auto",
					flex: 1,
					overscrollBehavior: "contain",
					WebkitOverflowScrolling: "touch",
				}}
			>
				<List disablePadding aria-label="Messages navigation">
					<ListItemButton
						selected={selectedApplicationId === undefined}
						onClick={() => {
							onSelectApplication(undefined);
							onCloseMobile();
						}}
					>
						<ListItemText primary="All Messages" />
					</ListItemButton>
					<Divider />
					{applications.map((application) => (
						<ListItemButton
							key={application.id}
							selected={selectedApplicationId === application.id}
							onClick={() => {
								onSelectApplication(application.id);
								onCloseMobile();
							}}
						>
							<ListItemAvatar sx={{ minWidth: 42 }}>
								<Avatar
									sx={{ width: 32, height: 32 }}
									src={getImageUrl(baseUrl, application.image)}
									variant="square"
								/>
							</ListItemAvatar>
							<ListItemText primary={application.name} />
						</ListItemButton>
					))}
				</List>
			</div>
		</div>
	);

	return (
		<>
			{/* Mobile temporary drawer */}
			<Drawer
				variant="temporary"
				open={mobileOpen}
				onClose={onCloseMobile}
				ModalProps={{
					keepMounted: true, // Better open performance on mobile.
				}}
				sx={{
					display: { xs: "block", sm: "none" },
					"& .MuiBackdrop-root": {
						top: { xs: 56, sm: 64 },
					},
					"& .MuiDrawer-paper": {
						width: 250,
						boxSizing: "border-box",
						top: { xs: 56, sm: 64 },
						height: {
							xs: "calc(100vh - 56px)",
							sm: "calc(100vh - 64px)",
						},
					},
				}}
			>
				{drawerContent}
			</Drawer>

			{/* Desktop permanent drawer */}
			<Drawer
				variant="permanent"
				sx={{
					display: { xs: "none", sm: "block" },
					width: 250,
					flexShrink: 0,
					"& .MuiDrawer-paper": {
						position: "fixed",
						width: 250,
						top: 64,
						height: "calc(100vh - 64px)",
						boxSizing: "border-box",
					},
				}}
			>
				{drawerContent}
			</Drawer>
		</>
	);
};
