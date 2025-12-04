"use client";

import { Moon, Sun, SunMoon } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark" | "system";

const THEME_CYCLE: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
} as const;

const getThemeIcon = (theme: Theme) => {
  const iconClass = "h-[1.2rem] w-[1.2rem]";

  switch (theme) {
    case "light":
      return <Sun className={iconClass} />;
    case "dark":
      return <Moon className={iconClass} />;
    case "system":
      return <SunMoon className={iconClass} />;
  }
};

export function ModeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <Button variant="outline" size="icon" aria-label="Loading theme toggle">
        <SunMoon className="h-[1.2rem] w-[1.2rem]" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    );
  }

  const currentTheme = (theme as Theme | undefined) ?? "system";
  const nextTheme = THEME_CYCLE[currentTheme];

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={() => setTheme(nextTheme)}
      aria-label={`Switch to ${nextTheme} theme`}
    >
      {getThemeIcon(currentTheme)}
      <span className="sr-only">Switch to ${nextTheme} theme</span>
    </Button>
  );
}
