"use client";

import { Check, Palette } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-theme";
import { getAvailableColorSchemes, type ColorScheme } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const colorSchemeMap: Record<ColorScheme, { name: string; color: string }> = {
	zinc: { name: "Zinc", color: "#71717a" },
	blue: { name: "Blue", color: "#3b82f6" },
	green: { name: "Green", color: "#22c55e" },
	purple: { name: "Purple", color: "#a855f7" },
	orange: { name: "Orange", color: "#f97316" },
	red: { name: "Red", color: "#ef4444" },
	pink: { name: "Pink", color: "#ec4899" },
	cyan: { name: "Cyan", color: "#06b6d4" },
	sky: { name: "Sky", color: "#0ea5e9" },
	indigo: { name: "Indigo", color: "#6366f1" },
	emerald: { name: "Emerald", color: "#10b981" },
	amber: { name: "Amber", color: "#f59e0b" },
	violet: { name: "Violet", color: "#8b5cf6" },
	rose: { name: "Rose", color: "#f43f5e" },
	lime: { name: "Lime", color: "#84cc16" },
	teal: { name: "Teal", color: "#14b8a6" },
	fuchsia: { name: "Fuchsia", color: "#d946ef" },
	slate: { name: "Slate", color: "#64748b" },
};

/**
 * Color scheme selector component
 * Allows users to choose from available color themes
 */
export function ColorSchemeSelector() {
	const { colorScheme, setColorScheme } = useTheme();
	const schemes = getAvailableColorSchemes();

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" className="gap-2">
					<Palette className="h-4 w-4" />
					<span className="hidden sm:inline">Color</span>
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>Color Scheme</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{schemes.map((scheme) => {
					const schemeInfo = colorSchemeMap[scheme.value];
					const isSelected = colorScheme === scheme.value;

					return (
						<DropdownMenuItem
							key={scheme.value}
							onClick={() => setColorScheme(scheme.value)}
							className="cursor-pointer"
						>
							<div className="flex items-center justify-between w-full gap-2">
								<div className="flex items-center gap-2">
									<div
										className="h-4 w-4 rounded-full border border-border"
										style={{ backgroundColor: schemeInfo.color }}
									/>
									<span>{schemeInfo.name}</span>
								</div>
								{isSelected && <Check className="h-4 w-4" />}
							</div>
						</DropdownMenuItem>
					);
				})}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
