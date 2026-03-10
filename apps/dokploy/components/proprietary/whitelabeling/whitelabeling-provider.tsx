"use client";

import Head from "next/head";
import { api } from "@/utils/api";

export function WhitelabelingProvider() {
	const { data: config } = api.whitelabeling.getPublic.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});

	if (!config) return null;

	return (
		<>
			<Head>
				{config.metaTitle && <title>{config.metaTitle}</title>}
				{config.faviconUrl && <link rel="icon" href={config.faviconUrl} />}
			</Head>

			{(config.customCss || config.primaryColor) && (
				<style
					id="whitelabeling-styles"
					dangerouslySetInnerHTML={{
						__html: [
							config.primaryColor
								? `:root { --primary: ${hexToHSL(config.primaryColor)}; }`
								: "",
							config.customCss || "",
						]
							.filter(Boolean)
							.join("\n"),
					}}
				/>
			)}
		</>
	);
}

/**
 * Converts a hex color string to HSL values (without the hsl() wrapper)
 * matching the format used by shadcn/ui CSS variables (e.g., "262 83% 58%")
 */
function hexToHSL(hex: string): string {
	// Remove # prefix if present
	const cleanHex = hex.replace(/^#/, "");

	if (
		!/^[0-9a-fA-F]{6}$/.test(cleanHex) &&
		!/^[0-9a-fA-F]{3}$/.test(cleanHex)
	) {
		return hex; // Return as-is if not a valid hex color (might be HSL already)
	}

	let r: number;
	let g: number;
	let b: number;

	if (cleanHex.length === 3) {
		r = Number.parseInt(cleanHex[0]! + cleanHex[0], 16);
		g = Number.parseInt(cleanHex[1]! + cleanHex[1], 16);
		b = Number.parseInt(cleanHex[2]! + cleanHex[2], 16);
	} else {
		r = Number.parseInt(cleanHex.slice(0, 2), 16);
		g = Number.parseInt(cleanHex.slice(2, 4), 16);
		b = Number.parseInt(cleanHex.slice(4, 6), 16);
	}

	r /= 255;
	g /= 255;
	b /= 255;

	const max = Math.max(r, g, b);
	const min = Math.min(r, g, b);
	const l = (max + min) / 2;
	let h = 0;
	let s = 0;

	if (max !== min) {
		const d = max - min;
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

		if (max === r) {
			h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
		} else if (max === g) {
			h = ((b - r) / d + 2) / 6;
		} else {
			h = ((r - g) / d + 4) / 6;
		}
	}

	return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}
