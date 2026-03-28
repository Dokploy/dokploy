import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	COLOR_THEMES,
	type ColorTheme,
	useColorTheme,
} from "./color-theme-provider";

const THEME_META: Record<ColorTheme, { label: string; hex: string }> = {
	zinc: { label: "Zinc", hex: "#71717a" },
	blue: { label: "Blue", hex: "#3b82f6" },
	violet: { label: "Violet", hex: "#8b5cf6" },
	pink: { label: "Pink", hex: "#ec4899" },
	rose: { label: "Rose", hex: "#f43f5e" },
	red: { label: "Red", hex: "#ef4444" },
	orange: { label: "Orange", hex: "#f97316" },
	amber: { label: "Amber", hex: "#f59e0b" },
	green: { label: "Green", hex: "#22c55e" },
	teal: { label: "Teal", hex: "#14b8a6" },
};

export function ColorThemePicker() {
	const { colorTheme, setColorTheme } = useColorTheme();

	return (
		<div className="flex flex-wrap gap-4">
			{COLOR_THEMES.map((theme) => {
				const isActive = colorTheme === theme;
				const { label, hex } = THEME_META[theme];
				return (
					<button
						key={theme}
						type="button"
						onClick={() => setColorTheme(theme)}
						className="flex flex-col items-center gap-1.5 focus-visible:outline-none group"
					>
						<span
							className={cn(
								"relative flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-150",
								isActive ? "scale-110" : "group-hover:scale-105",
							)}
							style={{
								backgroundColor: hex,
								outline: isActive
									? `2px solid ${hex}`
									: "2px solid transparent",
								outlineOffset: "2px",
							}}
						>
							{isActive && (
								<Check
									className="h-4 w-4 text-white drop-shadow-sm"
									strokeWidth={2.5}
								/>
							)}
						</span>
						<span
							className={cn(
								"text-xs",
								isActive
									? "font-medium text-foreground"
									: "text-muted-foreground group-hover:text-foreground",
							)}
						>
							{label}
						</span>
					</button>
				);
			})}
		</div>
	);
}
