import {
	getEffectiveWhitelabelingConfig,
	getWebServerSettings,
	hasValidLicenseForInstance,
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

export const whitelabelingRouter = createTRPCRouter({
	get: protectedProcedure.query(async () => {
		if (IS_CLOUD) {
			return null;
		}
		// Enterprise feature: only return branding when the license is active.
		if (!(await hasValidLicenseForInstance())) {
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
				metaDescription: null,
				ogImageUrl: null,
				footerText: null,
				passwordResetGuide: null,
				supportEmail: null,
				brandingEnabled: false,
				appearanceEnabled: false,
				metadataEnabled: false,
				errorPagesEnabled: false,
				forgotPasswordEnabled: false,
			},
		});

		return { success: true };
	}),

	// Public endpoint only for unauthenticated pages (login, register, error)
	// Returns only the fields needed for public pages
	getPublic: publicProcedure.query(async () => {
		if (IS_CLOUD) {
			return null;
		}
		// Enterprise feature: only expose branding when the license is active.
		if (!(await hasValidLicenseForInstance())) {
			return null;
		}
		const settings = await getWebServerSettings();
		const config = getEffectiveWhitelabelingConfig(
			settings?.whitelabelingConfig,
		);

		return {
			appName: config?.appName ?? null,
			appDescription: config?.appDescription ?? null,
			logoUrl: config?.logoUrl ?? null,
			loginLogoUrl: config?.loginLogoUrl ?? null,
			faviconUrl: config?.faviconUrl ?? null,
			customCss: config?.customCss ?? null,
			metaTitle: config?.metaTitle ?? null,
			metaDescription: config?.metaDescription ?? null,
			ogImageUrl: config?.ogImageUrl ?? null,
			errorPageTitle: config?.errorPageTitle ?? null,
			errorPageDescription: config?.errorPageDescription ?? null,
			footerText: config?.footerText ?? null,
			passwordResetGuide: config?.passwordResetGuide ?? null,
			supportEmail: config?.supportEmail ?? null,
			hideSocialLinks: settings?.hideSocialLinks ?? false,
		};
	}),
});
