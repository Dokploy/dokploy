import { createContext, useContext, useLayoutEffect, useState } from "react";

export const COLOR_THEMES = [
	"zinc",
	"blue",
	"violet",
	"pink",
	"rose",
	"red",
	"orange",
	"amber",
	"green",
	"teal",
] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

const STORAGE_KEY = "dokploy-color-theme";
const DEFAULT_THEME: ColorTheme = "zinc";

interface ColorThemeContextValue {
	colorTheme: ColorTheme;
	setColorTheme: (theme: ColorTheme) => void;
}

const ColorThemeContext = createContext<ColorThemeContextValue>({
	colorTheme: DEFAULT_THEME,
	setColorTheme: () => {},
});

export function ColorThemeProvider({
	children,
}: {
	children: React.ReactNode;
}) {
	const [colorTheme, setColorThemeState] = useState<ColorTheme>(DEFAULT_THEME);

	useLayoutEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
		const theme =
			stored && (COLOR_THEMES as readonly string[]).includes(stored)
				? stored
				: DEFAULT_THEME;
		setColorThemeState(theme);
		applyTheme(theme);
	}, []);

	function setColorTheme(theme: ColorTheme) {
		setColorThemeState(theme);
		localStorage.setItem(STORAGE_KEY, theme);
		applyTheme(theme);
	}

	return (
		<ColorThemeContext.Provider value={{ colorTheme, setColorTheme }}>
			{children}
		</ColorThemeContext.Provider>
	);
}

function applyTheme(theme: ColorTheme) {
	if (theme === DEFAULT_THEME) {
		document.documentElement.removeAttribute("data-color-theme");
	} else {
		document.documentElement.setAttribute("data-color-theme", theme);
	}
}

export function useColorTheme() {
	return useContext(ColorThemeContext);
}
