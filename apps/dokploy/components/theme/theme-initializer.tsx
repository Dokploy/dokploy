"use client";

import { useEffect } from "react";

/**
 * Client-side component to initialize theme color scheme
 */
export function ThemeInitializer() {
	useEffect(() => {
		const storedScheme = localStorage.getItem("dokploy-color-scheme") || "zinc";
		document.documentElement.setAttribute("data-color-scheme", storedScheme);
	}, []);

	return null;
}
