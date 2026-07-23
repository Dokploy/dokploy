import {
	getPublicWhitelabelingConfig,
	getWebServerSettings,
	hasValidLicense,
	IS_CLOUD,
	updateWebServerSettings,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { apiUpdateWhitelabeling } from "@/server/db/schema";
import {
	createTRPCRouter,
	enterpriseProcedure,
	protectedProcedure,
	publicProcedure,
} from "../../trpc";

/** Invalidate the SSR branding caches in _document.tsx so the next request picks up fresh settings. */
function clearBrandingSSRCache() {
	globalThis.__SETTINGS_CACHE = null;
	if (globalThis.__FAVICON_CACHE) {
		globalThis.__FAVICON_CACHE.clear();
	}
}

export const whitelabelingRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		if (IS_CLOUD) {
			return null;
		}
		if (!(await hasValidLicense(ctx.session.activeOrganizationId))) {
			return null;
		}
		const settings = await getWebServerSettings();
		return settings?.whitelabelingConfig ?? null;
	}),

	update: enterpriseProcedure
		.input(apiUpdateWhitelabeling)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Whitelabeling is not available in Cloud",
				});
			}

			if (ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the owner can update whitelabeling settings",
				});
			}

			await updateWebServerSettings({
				whitelabelingConfig: input.whitelabelingConfig,
			});

			// Clear the cache so Next.js SSR applies changes immediately
			clearBrandingSSRCache();

			return { success: true };
		}),

	reset: enterpriseProcedure.mutation(async ({ ctx }) => {
		if (IS_CLOUD) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Whitelabeling is not available in Cloud",
			});
		}

		if (ctx.user.role !== "owner") {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "Only the owner can reset whitelabeling settings",
			});
		}

		await updateWebServerSettings({
			whitelabelingConfig: {
				appName: null,
				appDescription: null,
				logoUrl: null,
				faviconUrl: null,
				customCss: null,
				loginLogoUrl: null,
				supportUrl: null,
				docsUrl: null,
				errorPageTitle: null,
				errorPageDescription: null,
				metaTitle: null,
				footerText: null,
			},
		});

		// Clear the cache so Next.js SSR applies changes immediately
		clearBrandingSSRCache();

		return { success: true };
	}),

	// Public endpoint only for unauthenticated pages (login, register, error)
	// Returns only the fields needed for public pages
	getPublic: publicProcedure.query(() => getPublicWhitelabelingConfig()),
});
