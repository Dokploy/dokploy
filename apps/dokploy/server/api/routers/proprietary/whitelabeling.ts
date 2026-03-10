import {
	getWebServerSettings,
	IS_CLOUD,
	updateWebServerSettings,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { apiUpdateWhitelabeling } from "@/server/db/schema";
import {
	createTRPCRouter,
	enterpriseProcedure,
	publicProcedure,
} from "../../trpc";

export const whitelabelingRouter = createTRPCRouter({
	get: enterpriseProcedure.query(async () => {
		if (IS_CLOUD) {
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
				primaryColor: null,
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

		return { success: true };
	}),

	// Public endpoint so the whitelabeling config can be applied globally
	// (including on the login page before auth)
	getPublic: publicProcedure.query(async () => {
		if (IS_CLOUD) {
			return null;
		}
		const settings = await getWebServerSettings();
		return settings?.whitelabelingConfig ?? null;
	}),
});
