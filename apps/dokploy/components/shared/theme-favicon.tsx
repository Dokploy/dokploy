"use client";

import { useTheme } from "next-themes";
import { useEffect } from "react";
import { api } from "@/utils/api";

// The base /icon.svg switches its fill via prefers-color-scheme, which follows
// the OS theme rather than Dokploy's own theme. This keeps the favicon in sync
// with the app theme by pointing the icon link at a theme-specific asset.
export function ThemeFavicon() {
	const { resolvedTheme } = useTheme();
	const { data: config } = api.whitelabeling.getPublic.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	useEffect(() => {
		// A custom whitelabeling favicon takes precedence over the theme icon.
		if (config?.faviconUrl) return;
		if (typeof document === "undefined") return;

		const href =
			resolvedTheme === "dark" ? "/icon-dark.svg" : "/icon-light.svg";

		let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
		if (!link) {
			link = document.createElement("link");
			link.rel = "icon";
			document.head.appendChild(link);
		}
		link.href = href;
	}, [resolvedTheme, config?.faviconUrl]);

	return null;
}
