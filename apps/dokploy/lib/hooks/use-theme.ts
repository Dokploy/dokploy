"use client";

import { useEffect, useState } from "react";
import { useTheme as useNextTheme } from "next-themes";
import type { ColorScheme, ThemeMode } from "@/lib/themes";

const COLOR_SCHEME_STORAGE_KEY = "dokploy-color-scheme";

/**
 * Custom hook for managing theme with color schemes
 */
export function useTheme() {
	const { theme, setTheme, resolvedTheme, systemTheme } = useNextTheme();
	const [colorScheme, setColorSchemeState] = useState<ColorScheme>("zinc");

	// Initialize color scheme from localStorage on mount
	useEffect(() => {
		if (typeof window === "undefined") return;
		const stored = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
		const scheme = (stored as ColorScheme) || "zinc";
		setColorSchemeState(scheme);
		document.documentElement.setAttribute("data-color-scheme", scheme);
	}, []);

	// Set color scheme
	const setColorScheme = (scheme: ColorScheme) => {
		if (typeof window === "undefined") return;
		localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
		setColorSchemeState(scheme);

		// Apply color scheme to document
		const root = document.documentElement;
		root.setAttribute("data-color-scheme", scheme);
	};

	// Get current theme mode
	const currentMode: ThemeMode =
		theme === "system" ? systemTheme || "light" : (theme as ThemeMode);

	return {
		theme: theme as ThemeMode,
		setTheme,
		resolvedTheme: resolvedTheme as ThemeMode,
		systemTheme,
		colorScheme,
		setColorScheme,
		currentMode,
	};
}
