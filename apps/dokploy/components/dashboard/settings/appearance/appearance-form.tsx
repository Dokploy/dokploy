"use client";

import { useTranslation } from "next-i18next";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "@/lib/hooks/use-theme";
import { getAvailableColorSchemes, type ColorScheme } from "@/lib/themes";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";

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

export function AppearanceForm() {
	const { t } = useTranslation("settings");
	const { theme, setTheme, colorScheme, setColorScheme, resolvedTheme } = useTheme();
	const schemes = getAvailableColorSchemes();

	const isDark = resolvedTheme === "dark";

	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("settings.appearance.title")}</CardTitle>
				<CardDescription>
					{t("settings.appearance.description")}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{/* Theme Mode Selection */}
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						{isDark ? (
							<Moon className="h-5 w-5 text-muted-foreground" />
						) : (
							<Sun className="h-5 w-5 text-muted-foreground" />
						)}
						<div>
							<label className="text-sm font-medium">
								{t("settings.appearance.theme")}
							</label>
							<p className="text-sm text-muted-foreground">
								{t("settings.appearance.themeDescription")}
							</p>
						</div>
					</div>
					<div className="grid grid-cols-3 gap-3">
						<Button
							variant={theme === "light" ? "default" : "outline"}
							className="justify-start gap-2 h-auto py-3"
							onClick={() => setTheme("light")}
						>
							<Sun className="h-4 w-4" />
							<div className="flex flex-col items-start">
								<span className="font-medium">
									{t("settings.appearance.themes.light")}
								</span>
							</div>
							{theme === "light" && (
								<Check className="ml-auto h-4 w-4" />
							)}
						</Button>
						<Button
							variant={theme === "dark" ? "default" : "outline"}
							className="justify-start gap-2 h-auto py-3"
							onClick={() => setTheme("dark")}
						>
							<Moon className="h-4 w-4" />
							<div className="flex flex-col items-start">
								<span className="font-medium">
									{t("settings.appearance.themes.dark")}
								</span>
							</div>
							{theme === "dark" && (
								<Check className="ml-auto h-4 w-4" />
							)}
						</Button>
						<Button
							variant={theme === "system" ? "default" : "outline"}
							className="justify-start gap-2 h-auto py-3"
							onClick={() => setTheme("system")}
						>
							<div className="flex items-center gap-1">
								<Sun className="h-3 w-3" />
								<Moon className="h-3 w-3" />
							</div>
							<div className="flex flex-col items-start">
								<span className="font-medium">
									{t("settings.appearance.themes.system")}
								</span>
							</div>
							{theme === "system" && (
								<Check className="ml-auto h-4 w-4" />
							)}
						</Button>
					</div>
				</div>

				{/* Color Scheme Selection */}
				<div className="space-y-3">
					<div className="flex items-center gap-2">
						<Palette className="h-5 w-5 text-muted-foreground" />
						<div>
							<label className="text-sm font-medium">Color Scheme</label>
							<p className="text-sm text-muted-foreground">
								Choose a color scheme for your dashboard
							</p>
						</div>
					</div>
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
						{schemes.map((scheme) => {
							const schemeInfo = colorSchemeMap[scheme.value];
							const isSelected = colorScheme === scheme.value;

							return (
								<Button
									key={scheme.value}
									variant={isSelected ? "default" : "outline"}
									className="justify-start gap-2 h-auto py-3 flex-col"
									onClick={() => setColorScheme(scheme.value)}
								>
									<div className="flex items-center justify-between w-full">
										<div
											className="h-6 w-6 rounded-full border-2 border-current"
											style={{
												backgroundColor: schemeInfo.color,
												borderColor: isSelected
													? "currentColor"
													: "hsl(var(--border))",
											}}
										/>
										{isSelected && <Check className="h-4 w-4" />}
									</div>
									<span className="text-sm font-medium">
										{schemeInfo.name}
									</span>
								</Button>
							);
						})}
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

