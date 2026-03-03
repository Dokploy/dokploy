import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, createTRPCRouter } from "../trpc";
import { db } from "@dokploy/server/db";
import { domainProviders } from "@dokploy/server/db/schema/domain-provider";
import { eq } from "drizzle-orm";
import { encryptToken } from "@dokploy/server/providers/encryption";

export const oauthRouter = createTRPCRouter({
	// Generate OAuth authorization URL for Netlify
	generateAuthUrl: protectedProcedure
		.input(z.object({ domainProviderId: z.string() }))
		.query(async ({ input, ctx }) => {
			const provider = await db.query.domainProviders.findFirst({
				where: eq(domainProviders.domainProviderId, input.domainProviderId),
			});

			if (!provider || provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			if (provider.type !== "netlify") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "OAuth is only supported for Netlify providers",
				});
			}

			// Generate a state parameter for security
			const state = Buffer.from(JSON.stringify({
				domainProviderId: input.domainProviderId,
				userId: ctx.session.user.id,
				timestamp: Date.now(),
			})).toString('base64');

			// Required OAuth scopes for DNS management
			const scopes = [
				"dns:read",
				"dns:write",
				"sites:read",
				"sites:write"
			].join(' ');

			const authUrl = new URL("https://app.netlify.com/authorize");
			authUrl.searchParams.set("client_id", provider.clientId || "");
			authUrl.searchParams.set("redirect_uri", `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/netlify/callback`);
			authUrl.searchParams.set("response_type", "code");
			authUrl.searchParams.set("scope", scopes);
			authUrl.searchParams.set("state", state);

			return {
				authUrl: authUrl.toString(),
				state,
			};
		}),

	// Handle OAuth callback
	handleCallback: protectedProcedure
		.input(z.object({
			code: z.string(),
			state: z.string(),
		}))
		.mutation(async ({ input, ctx }) => {
			try {
				// Decode and verify state parameter
				const stateData = JSON.parse(Buffer.from(input.state, 'base64').toString());

				if (!stateData.domainProviderId || !stateData.userId) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Invalid state parameter",
					});
				}

				// Verify this is the same user who initiated the flow
				if (stateData.userId !== ctx.session.user.id) {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "Invalid user for OAuth flow",
					});
				}

				// Check if state is too old (10 minutes)
				if (Date.now() - stateData.timestamp > 10 * 60 * 1000) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "OAuth flow expired",
					});
				}

				// Get the provider
				const provider = await db.query.domainProviders.findFirst({
					where: eq(domainProviders.domainProviderId, stateData.domainProviderId),
				});

				if (!provider || provider.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Domain provider not found",
					});
				}

				if (!provider.clientId || !provider.clientSecret) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Provider is not configured for OAuth",
					});
				}

				// Exchange authorization code for access token
				const tokenResponse = await fetch("https://api.netlify.com/oauth/token", {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						grant_type: "authorization_code",
						code: input.code,
						client_id: provider.clientId,
						client_secret: provider.clientSecret,
						redirect_uri: `${process.env.NEXTAUTH_URL || "http://localhost:3000"}/api/auth/netlify/callback`,
					}),
				});

				if (!tokenResponse.ok) {
					const errorData = await tokenResponse.json().catch(() => ({}));
					throw new TRPCError({
						code: "INTERNAL_SERVER_ERROR",
						message: `Token exchange failed: ${errorData.error_description || errorData.error || "Unknown error"}`,
					});
				}

				const tokenData = await tokenResponse.json();

				// Update provider with token information
				const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

				await db
					.update(domainProviders)
					.set({
						accessToken: encryptToken(tokenData.access_token),
						refreshToken: tokenData.refresh_token ? encryptToken(tokenData.refresh_token) : null,
						tokenExpiresAt: expiresAt,
					})
					.where(eq(domainProviders.domainProviderId, stateData.domainProviderId));

				return {
					success: true,
					message: "OAuth authorization completed successfully",
				};
			} catch (error) {
				console.error("OAuth callback error:", error);
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: error instanceof Error ? error.message : "OAuth callback failed",
				});
			}
		}),

	// Get OAuth status for a provider
	getOAuthStatus: protectedProcedure
		.input(z.object({ domainProviderId: z.string() }))
		.query(async ({ input, ctx }) => {
			const provider = await db.query.domainProviders.findFirst({
				where: eq(domainProviders.domainProviderId, input.domainProviderId),
			});

			if (!provider || provider.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Domain provider not found",
				});
			}

			const isConnected = !!(provider.accessToken && provider.tokenExpiresAt &&
				new Date(provider.tokenExpiresAt) > new Date());

			return {
				isConnected,
				tokenExpiresAt: provider.tokenExpiresAt,
			};
		}),
});