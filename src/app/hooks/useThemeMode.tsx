import Brightness4 from "@mui/icons-material/Brightness4";
import Brightness7 from "@mui/icons-material/Brightness7";
import BrightnessAuto from "@mui/icons-material/BrightnessAuto";
import { createTheme, useMediaQuery } from "@mui/material";
import { useMemo, useState } from "react";

export type ThemeMode = "system" | "light" | "dark";

export const useThemeMode = () => {
	const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
		const stored = window.localStorage.getItem("gotify-theme");
		return stored === "light" || stored === "dark" || stored === "system"
			? stored
			: "system";
	});

	const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
	const paletteMode =
		themeMode === "system" ? (prefersDark ? "dark" : "light") : themeMode;

	const theme = useMemo(
		() => createTheme({ palette: { mode: paletteMode } }),
		[paletteMode],
	);

	const toggleTheme = () => {
		const next: ThemeMode =
			themeMode === "dark"
				? "light"
				: themeMode === "light"
					? "system"
					: "dark";
		setThemeMode(next);
		window.localStorage.setItem("gotify-theme", next);
	};

	const themeIcon =
		themeMode === "dark" ? (
			<Brightness4 />
		) : themeMode === "light" ? (
			<Brightness7 />
		) : (
			<BrightnessAuto />
		);

	return { themeMode, theme, toggleTheme, themeIcon };
};
