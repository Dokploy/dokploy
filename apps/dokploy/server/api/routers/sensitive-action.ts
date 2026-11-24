import {
	auth,
	consumeVerificationAttempt,
	findCredentialAccount,
	findUserById,
	getWebServerSettings,
	IS_CLOUD,
	markSessionVerified,
	resetVerificationAttempts,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { account, passkey, ssoProvider } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	requireSensitiveVerification,
} from "../trpc";

export const sensitiveActionRouter = createTRPCRouter({
	methods: protectedProcedure.query(async ({ ctx }) => {
		const settings = await getWebServerSettings();
		const enforceSSO = !!settings?.enforceSSO;

		const accounts = await db.query.account.findMany({
			where: eq(account.userId, ctx.user.id),
			columns: { providerId: true, password: true },
		});
		const hasPassword = accounts.some(
			(a) => a.providerId === "credential" && !!a.password,
		);

		const providerIds = accounts.map((a) => a.providerId);
		const sso =
			providerIds.length > 0
				? await db.query.ssoProvider.findFirst({
						where: inArray(ssoProvider.providerId, providerIds),
						columns: { providerId: true },
					})
				: undefined;

		const passkeys = enforceSSO
			? []
			: await db.query.passkey.findMany({
					where: eq(passkey.userId, ctx.user.id),
					columns: { id: true },
				});

		const user = await findUserById(ctx.user.id);

		return {
			password: hasPassword && !enforceSSO,
			requiresTotp: !!user.twoFactorEnabled,
			passkey: passkeys.length > 0,
			ssoProviderId: sso?.providerId ?? null,
			socialProviders: IS_CLOUD
				? [...new Set(providerIds)].filter(
						(id): id is "github" | "google" =>
							id === "github" || id === "google",
					)
				: [],
		};
	}),

	verifyPassword: protectedProcedure
		.input(
			z.object({
				password: z.string().min(1),
				totpCode: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const settings = await getWebServerSettings();
			if (settings?.enforceSSO) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "SSO is enforced. Verify by signing in with SSO.",
				});
			}

			const credential = await findCredentialAccount(ctx.user.id);
			if (!credential?.password) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Your account has no password",
				});
			}

			if (!consumeVerificationAttempt(ctx.user.id)) {
				throw new TRPCError({
					code: "TOO_MANY_REQUESTS",
					message: "Too many failed attempts. Try again in a few minutes.",
				});
			}

			const headers = new Headers({ cookie: ctx.req.headers.cookie || "" });

			try {
				await auth.verifyPassword({
					body: { password: input.password },
					headers,
				});
			} catch {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "The password is incorrect",
				});
			}

			const user = await findUserById(ctx.user.id);
			if (user.twoFactorEnabled) {
				if (!input.totpCode) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "The authenticator code is required",
					});
				}
				try {
					await auth.verifyTOTP({
						body: { code: input.totpCode },
						headers,
					});
				} catch {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "The authenticator code is incorrect",
					});
				}
			}

			resetVerificationAttempts(ctx.user.id);
			await markSessionVerified(ctx.session.id);
			return true;
		}),

	ensureVerified: protectedProcedure
		.use(requireSensitiveVerification)
		.mutation(() => true),
});
