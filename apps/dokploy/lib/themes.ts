/**
 * Theme system for Dokploy
 * Provides theme definitions and utilities for managing custom color schemes
 */

export type ColorScheme = 
	| "zinc" 
	| "blue" 
	| "green" 
	| "purple" 
	| "orange" 
	| "red" 
	| "pink"
	| "cyan"
	| "sky"
	| "indigo"
	| "emerald"
	| "amber"
	| "violet"
	| "rose"
	| "lime"
	| "teal"
	| "fuchsia"
	| "slate";
export type ThemeMode = "light" | "dark" | "system";

export interface ThemeConfig {
	colorScheme: ColorScheme;
	mode: ThemeMode;
}

/**
 * Color scheme definitions
 * Each scheme defines primary, secondary, accent, and other semantic colors
 */
export const colorSchemes: Record<
	ColorScheme,
	{
		light: Record<string, string>;
		dark: Record<string, string>;
		name: string;
		description: string;
	}
> = {
	zinc: {
		name: "Zinc",
		description: "Default gray theme",
		light: {
			"--primary": "240 5.9% 10%",
			"--primary-foreground": "0 0% 98%",
			"--secondary": "240 4.8% 95.9%",
			"--secondary-foreground": "240 5.9% 10%",
			"--accent": "240 4.8% 95.9%",
			"--accent-foreground": "240 5.9% 10%",
		},
		dark: {
			"--primary": "0 0% 98%",
			"--primary-foreground": "240 5.9% 10%",
			"--secondary": "240 3.7% 15.9%",
			"--secondary-foreground": "0 0% 98%",
			"--accent": "240 3.7% 15.9%",
			"--accent-foreground": "0 0% 98%",
		},
	},
	blue: {
		name: "Blue",
		description: "Professional blue theme",
		light: {
			"--primary": "217.2 91.2% 59.8%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "217.2 91.2% 59.8%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "217.2 91.2% 59.8%",
			"--primary-foreground": "222.2 47.4% 11.2%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "217.2 91.2% 59.8%",
			"--accent-foreground": "222.2 47.4% 11.2%",
		},
	},
	green: {
		name: "Green",
		description: "Fresh green theme",
		light: {
			"--primary": "142.1 76.2% 36.3%",
			"--primary-foreground": "355.7 100% 97.3%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "142.1 76.2% 36.3%",
			"--accent-foreground": "355.7 100% 97.3%",
		},
		dark: {
			"--primary": "142.1 70.6% 45.3%",
			"--primary-foreground": "144.9 80.4% 10%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "142.1 70.6% 45.3%",
			"--accent-foreground": "144.9 80.4% 10%",
		},
	},
	purple: {
		name: "Purple",
		description: "Elegant purple theme",
		light: {
			"--primary": "262.1 83.3% 57.8%",
			"--primary-foreground": "210 40% 98%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "262.1 83.3% 57.8%",
			"--accent-foreground": "210 40% 98%",
		},
		dark: {
			"--primary": "263.4 70% 50.4%",
			"--primary-foreground": "210 40% 98%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "263.4 70% 50.4%",
			"--accent-foreground": "210 40% 98%",
		},
	},
	orange: {
		name: "Orange",
		description: "Warm orange theme",
		light: {
			"--primary": "24.6 95% 53.1%",
			"--primary-foreground": "60 9.1% 97.8%",
			"--secondary": "60 9.1% 97.8%",
			"--secondary-foreground": "20 14.3% 4.1%",
			"--accent": "24.6 95% 53.1%",
			"--accent-foreground": "60 9.1% 97.8%",
		},
		dark: {
			"--primary": "20.5 90.2% 48.2%",
			"--primary-foreground": "60 9.1% 97.8%",
			"--secondary": "12 6.5% 15.1%",
			"--secondary-foreground": "60 9.1% 97.8%",
			"--accent": "20.5 90.2% 48.2%",
			"--accent-foreground": "60 9.1% 97.8%",
		},
	},
	red: {
		name: "Red",
		description: "Bold red theme",
		light: {
			"--primary": "0 72.2% 50.6%",
			"--primary-foreground": "0 0% 98%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "0 72.2% 50.6%",
			"--accent-foreground": "0 0% 98%",
		},
		dark: {
			"--primary": "0 72.2% 50.6%",
			"--primary-foreground": "0 0% 98%",
			"--secondary": "0 0% 14.9%",
			"--secondary-foreground": "0 0% 98%",
			"--accent": "0 72.2% 50.6%",
			"--accent-foreground": "0 0% 98%",
		},
	},
	pink: {
		name: "Pink",
		description: "Playful pink theme",
		light: {
			"--primary": "346.8 77.2% 49.8%",
			"--primary-foreground": "355.7 100% 97.3%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "346.8 77.2% 49.8%",
			"--accent-foreground": "355.7 100% 97.3%",
		},
		dark: {
			"--primary": "346.8 77.2% 49.8%",
			"--primary-foreground": "355.7 100% 97.3%",
			"--secondary": "240 3.7% 15.9%",
			"--secondary-foreground": "0 0% 98%",
			"--accent": "346.8 77.2% 49.8%",
			"--accent-foreground": "355.7 100% 97.3%",
		},
	},
	cyan: {
		name: "Cyan",
		description: "Cool cyan theme",
		light: {
			"--primary": "188 85% 53%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "188 85% 53%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "188 85% 53%",
			"--primary-foreground": "195 100% 15%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "188 85% 53%",
			"--accent-foreground": "195 100% 15%",
		},
	},
	sky: {
		name: "Sky",
		description: "Bright sky blue theme",
		light: {
			"--primary": "199 89% 48%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "199 89% 48%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "199 89% 48%",
			"--primary-foreground": "200 100% 20%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "199 89% 48%",
			"--accent-foreground": "200 100% 20%",
		},
	},
	indigo: {
		name: "Indigo",
		description: "Deep indigo theme",
		light: {
			"--primary": "239 84% 67%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "239 84% 67%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "239 84% 67%",
			"--primary-foreground": "243 75% 15%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "239 84% 67%",
			"--accent-foreground": "243 75% 15%",
		},
	},
	emerald: {
		name: "Emerald",
		description: "Vibrant emerald theme",
		light: {
			"--primary": "160 84% 39%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "160 84% 39%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "160 84% 39%",
			"--primary-foreground": "165 91% 15%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "160 84% 39%",
			"--accent-foreground": "165 91% 15%",
		},
	},
	amber: {
		name: "Amber",
		description: "Warm amber theme",
		light: {
			"--primary": "43 96% 56%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "43 96% 56%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "43 96% 56%",
			"--primary-foreground": "45 100% 20%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "43 96% 56%",
			"--accent-foreground": "45 100% 20%",
		},
	},
	violet: {
		name: "Violet",
		description: "Rich violet theme",
		light: {
			"--primary": "258 90% 66%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "258 90% 66%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "258 90% 66%",
			"--primary-foreground": "270 91% 20%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "258 90% 66%",
			"--accent-foreground": "270 91% 20%",
		},
	},
	rose: {
		name: "Rose",
		description: "Soft rose theme",
		light: {
			"--primary": "346 77% 50%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "346 77% 50%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "346 77% 50%",
			"--primary-foreground": "353 85% 15%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "346 77% 50%",
			"--accent-foreground": "353 85% 15%",
		},
	},
	lime: {
		name: "Lime",
		description: "Bright lime theme",
		light: {
			"--primary": "75 85% 47%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "75 85% 47%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "75 85% 47%",
			"--primary-foreground": "80 95% 15%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "75 85% 47%",
			"--accent-foreground": "80 95% 15%",
		},
	},
	teal: {
		name: "Teal",
		description: "Calm teal theme",
		light: {
			"--primary": "173 80% 40%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "173 80% 40%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "173 80% 40%",
			"--primary-foreground": "180 100% 15%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "173 80% 40%",
			"--accent-foreground": "180 100% 15%",
		},
	},
	fuchsia: {
		name: "Fuchsia",
		description: "Vibrant fuchsia theme",
		light: {
			"--primary": "292 92% 58%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "292 92% 58%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "292 92% 58%",
			"--primary-foreground": "295 100% 20%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "292 92% 58%",
			"--accent-foreground": "295 100% 20%",
		},
	},
	slate: {
		name: "Slate",
		description: "Cool slate gray theme",
		light: {
			"--primary": "215 16% 47%",
			"--primary-foreground": "0 0% 100%",
			"--secondary": "210 40% 96.1%",
			"--secondary-foreground": "222.2 47.4% 11.2%",
			"--accent": "215 16% 47%",
			"--accent-foreground": "0 0% 100%",
		},
		dark: {
			"--primary": "215 28% 17%",
			"--primary-foreground": "210 40% 98%",
			"--secondary": "217.2 32.6% 17.5%",
			"--secondary-foreground": "210 40% 98%",
			"--accent": "215 28% 17%",
			"--accent-foreground": "210 40% 98%",
		},
	},
};

/**
 * Apply theme color scheme to the document
 */
export function applyColorScheme(scheme: ColorScheme, isDark: boolean) {
	const root = document.documentElement;
	const themeColors = colorSchemes[scheme];
	const colors = isDark ? themeColors.dark : themeColors.light;

	Object.entries(colors).forEach(([key, value]) => {
		root.style.setProperty(key, value);
	});
}

/**
 * Get theme class name for applying theme
 */
export function getThemeClassName(scheme: ColorScheme, mode: ThemeMode): string {
	const classes: string[] = [];
	
	if (mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
		classes.push("dark");
	}
	
	classes.push(`theme-${scheme}`);
	return classes.join(" ");
}

/**
 * Get all available color schemes
 */
export function getAvailableColorSchemes() {
	return Object.entries(colorSchemes).map(([key, value]) => ({
		value: key as ColorScheme,
		name: value.name,
		description: value.description,
	}));
}

