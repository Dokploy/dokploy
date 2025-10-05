import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	getOidcSettings,
	upsertOidcSettings,
	upsertOidcSettingsInputSchema,
} from "@dokploy/server/services/sso-config";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";

const updateSchema = upsertOidcSettingsInputSchema;

export const ssoRouter = createTRPCRouter({
	getSettings: adminProcedure.query(async () => {
		const settings = await getOidcSettings();
		return settings;
	}),
	updateSettings: adminProcedure
		.input(updateSchema)
		.mutation(async ({ input, ctx }) => {
			if (!ctx.req?.headers) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Missing request context",
				});
			}

			const result = await upsertOidcSettings(input, ctx.req.headers);
			return result;
		}),
	getStatus: publicProcedure.query(async () => {
		const settings = await getOidcSettings();
		const ready =
			settings.enabled &&
			Boolean(settings.clientId) &&
			Boolean(settings.clientSecret) &&
			Boolean(settings.issuer) &&
			Boolean(settings.discoveryUrl);

		return {
			enabled: ready,
			providerId: settings.providerId,
			displayName:
				settings.displayName && settings.displayName.length > 0
					? settings.displayName
					: "OpenID Connect",
		};
	}),
});
