import { getWebServerSettings, updateWebServerSettings } from "@dokploy/server";
import { IS_CLOUD } from "@dokploy/server/constants";
import { apiUpdateWhitelabelSettings } from "@dokploy/server/db/schema";
import {
	createTRPCRouter,
	enterpriseProcedure,
	publicProcedure,
} from "@/server/api/trpc";

export const whitelabelRouter = createTRPCRouter({
	get: publicProcedure.query(async () => {
		if (IS_CLOUD) return null;

		const settings = await getWebServerSettings();
		if (!settings) return null;

		return {
			appName: settings.whitelabelAppName ?? null,
			logoUrl: settings.whitelabelLogoUrl ?? null,
			faviconUrl: settings.whitelabelFaviconUrl ?? null,
			tagline: settings.whitelabelTagline ?? null,
			customCss: settings.whitelabelCustomCss ?? null,
		};
	}),
	update: enterpriseProcedure
		.input(apiUpdateWhitelabelSettings)
		.mutation(async ({ input }) => {
			if (IS_CLOUD) {
				throw new Error(
					"Whitelabelling is only available in self-hosted (non-cloud) installations.",
				);
			}

			await updateWebServerSettings({
				...(input.appName !== undefined && {
					whitelabelAppName: input.appName,
				}),
				...(input.tagline !== undefined && {
					whitelabelTagline: input.tagline,
				}),
				...(input.logoUrl !== undefined && {
					whitelabelLogoUrl: input.logoUrl,
				}),
				...(input.faviconUrl !== undefined && {
					whitelabelFaviconUrl: input.faviconUrl,
				}),
				...(input.customCss !== undefined && {
					whitelabelCustomCss: input.customCss,
				}),
			});

			const settings = await getWebServerSettings();
			return {
				appName: settings?.whitelabelAppName ?? null,
				logoUrl: settings?.whitelabelLogoUrl ?? null,
				faviconUrl: settings?.whitelabelFaviconUrl ?? null,
				tagline: settings?.whitelabelTagline ?? null,
				customCss: settings?.whitelabelCustomCss ?? null,
			};
		}),
});
