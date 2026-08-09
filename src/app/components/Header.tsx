import ExitToApp from "@mui/icons-material/ExitToApp";
import GitHub from "@mui/icons-material/GitHub";
import MenuIcon from "@mui/icons-material/Menu";
import Refresh from "@mui/icons-material/Refresh";
import Settings from "@mui/icons-material/Settings";
import {
	AppBar,
	IconButton,
	Stack,
	Toolbar,
	Tooltip,
	Typography,
} from "@mui/material";

interface HeaderProps {
	authenticated: boolean;
	messagesLoading: boolean;
	submitting: boolean;
	themeMode: string;
	themeIcon: React.ReactNode;
	onToggleNav: () => void;
	onRefresh: () => void;
	onOpenSettings: () => void;
	onLogout: () => void;
	onToggleTheme: () => void;
}

export const Header = ({
	authenticated,
	messagesLoading,
	submitting,
	themeMode,
	themeIcon,
	onToggleNav,
	onRefresh,
	onOpenSettings,
	onLogout,
	onToggleTheme,
}: HeaderProps) => {
	return (
		<AppBar
			position="fixed"
			elevation={4}
			sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}
		>
			<Toolbar sx={{ justifyContent: "space-between" }}>
				<Stack direction="row" alignItems="center" spacing={1}>
					{authenticated && (
						<IconButton
							color="inherit"
							aria-label="open drawer"
							edge="start"
							onClick={onToggleNav}
							sx={{ mr: 1, display: { sm: "none" } }}
						>
							<MenuIcon />
						</IconButton>
					)}
					<Typography
						variant="h5"
						sx={{
							userSelect: "none",
							msUserSelect: "none",
							MozUserSelect: "none",
							WebkitUserSelect: "none",
						}}
					>
						Gotify
					</Typography>
				</Stack>
				<Stack direction="row" alignItems="center">
					{authenticated && (
						<>
							<Tooltip title="Sync messages" arrow>
								<IconButton
									color="inherit"
									onClick={onRefresh}
									disabled={messagesLoading || submitting}
									aria-label="Sync messages"
								>
									<Refresh />
								</IconButton>
							</Tooltip>
							<Tooltip title="Settings" arrow>
								<IconButton
									color="inherit"
									onClick={onOpenSettings}
									aria-label="Settings"
								>
									<Settings />
								</IconButton>
							</Tooltip>
							<Tooltip title="Logout" arrow>
								<IconButton
									color="inherit"
									onClick={onLogout}
									disabled={submitting}
									aria-label="Logout"
								>
									<ExitToApp />
								</IconButton>
							</Tooltip>
						</>
					)}
					<Tooltip title={`Toggle theme (current: ${themeMode})`} arrow>
						<IconButton
							color="inherit"
							onClick={onToggleTheme}
							aria-label="Toggle theme"
						>
							{themeIcon}
						</IconButton>
					</Tooltip>
					<Tooltip title="GitHub Repository" arrow>
						<IconButton
							color="inherit"
							component="a"
							href="https://github.com/sametcn99/gotify-web-extension"
							target="_blank"
							rel="noopener noreferrer"
							aria-label="GitHub Repository"
						>
							<GitHub />
						</IconButton>
					</Tooltip>
				</Stack>
			</Toolbar>
		</AppBar>
	);
};
