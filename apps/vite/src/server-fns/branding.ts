import { createServerFn } from "@tanstack/react-start";

export interface PublicBranding {
	appName: string | null;
	appDescription: string | null;
	logoUrl: string | null;
	loginLogoUrl: string | null;
	faviconUrl: string | null;
	customCss: string | null;
	metaTitle: string | null;
	errorPageTitle: string | null;
	errorPageDescription: string | null;
	footerText: string | null;
}

let cached: { at: number; value: PublicBranding | null } | null = null;

export const getBrandingFn = createServerFn({ method: "GET" }).handler(
	async (): Promise<PublicBranding | null> => {
		if (cached && Date.now() - cached.at < 60_000) {
			return cached.value;
		}
		let value: PublicBranding | null = null;
		try {
			const response = await fetch(
				`http://localhost:${process.env.PORT ?? 3000}/api/branding`,
			);
			if (response.ok) {
				value = (await response.json()) as PublicBranding | null;
			}
		} catch {
			value = null;
		}
		cached = { at: Date.now(), value };
		return value;
	},
);
