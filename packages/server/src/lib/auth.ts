import type { IncomingMessage } from "node:http";
import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { scim } from "@better-auth/scim";
import { sso } from "@better-auth/sso";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { admin, mcp, organization, twoFactor } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import {
	getTrustedOrigins,
	getTrustedProviders,
	getUserByToken,
} from "../services/admin";
import {
	consumeRotatedRefreshToken,
	DOKPLOY_MCP_SCOPE_IDS,
	evaluateMcpAuthorizeGate,
	evaluateMcpRegisterBody,
	getMcpAccessTokenSeconds,
	getMcpRefreshTokenSeconds,
	MCP_AUTHORIZE_PAGE_PATH,
	MCP_ENDPOINT_PATH,
} from "../services/mcp-oauth";
import { createAuditLog } from "../services/proprietary/audit-log";
import { resolveOrganizationDefaultRole } from "../services/proprietary/license-key";
import {
	getWebServerSettings,
	updateWebServerSettings,
} from "../services/web-server-settings";
import { getHubSpotUTK, submitToHubSpot } from "../utils/tracking/hubspot";
import {
	sendEmail,
	sendVerificationEmail,
} from "../verification/send-verification-email";
import { getPublicIpWithFallback } from "../wss/utils";
import { ac, adminRole, memberRole, ownerRole } from "./access-control";
import { betterAuthSecret } from "./auth-secret";

// Number of days a login session stays valid (sliding window). Reads
// DOKPLOY_SESSION_DAYS, falling back to 30. Invalid or non-positive values
// fall back to the default so a bad env var can never lock everyone out.
const DEFAULT_SESSION_DAYS = 30;
const getSessionDays = () => {
	const raw = process.env.DOKPLOY_SESSION_DAYS;
	if (!raw) return DEFAULT_SESSION_DAYS;
	const parsed = Number.parseInt(raw, 10);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SESSION_DAYS;
};

const resolveTrustedOrigins = async () => {
	try {
		if (IS_CLOUD) {
			return await getTrustedOrigins();
		}
		const [trustedOrigins, settings] = await Promise.all([
			getTrustedOrigins(),
			getWebServerSettings(),
		]);

		if (!settings) return [];

		const devOrigins =
			process.env.NODE_ENV === "development"
				? [
						"http://localhost:3000",
						"https://absolutely-handy-falcon.ngrok-free.app",
					]
				: [];
		return [
			...(settings?.serverIp ? [`http://${settings?.serverIp}:3000`] : []),
			...(settings?.host ? [`https://${settings?.host}`] : []),
			...devOrigins,
			...trustedOrigins,
		];
	} catch (error) {
		console.error("Failed to resolve trusted origins:", error);
		return [];
	}
};

const createBetterAuth = () =>
	betterAuth({
		database: drizzleAdapter(db, {
			provider: "pg",
			schema: schema,
		}),
		disabledPaths: [
			"/sso/register",
			"/organization/create",
			"/organization/update",
			"/organization/delete",
			// The fork serves OAuth discovery from /api/mcp-oauth/* (see
			// services/mcp-oauth.ts); the plugin's copies need a global baseURL.
			"/.well-known/oauth-authorization-server",
			"/.well-known/oauth-protected-resource",
			"/oauth2/consent",
			// The plugin's own session lookup returns the whole token row,
			// refresh token included, to any bearer of an access token. The fork
			// resolves tokens itself (services/mcp-oauth.ts) and never calls it.
			"/mcp/get-session",
			...(!IS_CLOUD ? ["/verify-email"] : []),
		],
		secret: betterAuthSecret,
		onAPIError: {
			errorURL: "/",
		},
		...(!IS_CLOUD
			? {
					advanced: {
						useSecureCookies: false,
						defaultCookieAttributes: {
							sameSite: "lax",
							secure: false,
							httpOnly: true,
							path: "/",
						},
					},
				}
			: {}),

		account: {
			accountLinking: {
				enabled: true,
				async trustedProviders() {
					const fromDb = await getTrustedProviders();
					return ["github", "google", ...fromDb];
				},
				allowDifferentEmails: true,
			},
		},
		appName: "Dokploy",
		socialProviders: {
			github: {
				clientId: process.env.GITHUB_CLIENT_ID as string,
				clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
			},
			google: {
				clientId: process.env.GOOGLE_CLIENT_ID as string,
				clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
			},
		},
		logger: {
			disabled: process.env.NODE_ENV === "production",
		},
		trustedOrigins: resolveTrustedOrigins,
		hooks: {
			before: createAuthMiddleware(async (ctx) => {
				ctx.context.trustedOrigins = [
					...(ctx.context.baseURL ? [new URL(ctx.context.baseURL).origin] : []),
					...(await resolveTrustedOrigins()),
				].filter(Boolean);

				const isBlockedAuthPath =
					ctx.path.startsWith("/sign-in/email") ||
					ctx.path.startsWith("/sign-in/social") ||
					// Linking a social account would add a login method that
					// bypasses SSO as soon as enforcement is turned off.
					ctx.path.startsWith("/link-social") ||
					ctx.path.startsWith("/sign-in/passkey") ||
					ctx.path.startsWith("/sign-up/email") ||
					ctx.path.startsWith("/passkey/verify-authentication") ||
					ctx.path.startsWith("/passkey/generate-authenticate-options");

				if (!IS_CLOUD && isBlockedAuthPath) {
					const settings = await getWebServerSettings();
					if (settings?.enforceSSO) {
						throw new APIError("FORBIDDEN", {
							message:
								"SSO is enforced. Direct password, social, and passkey sign-in are disabled.",
						});
					}
				}

				// Dynamic client registration is anonymous: only loopback-http or
				// https redirect targets may receive authorization codes.
				if (ctx.path === "/mcp/register") {
					const decision = evaluateMcpRegisterBody(ctx.body);
					if (!decision.ok) {
						throw new APIError("BAD_REQUEST", {
							error: decision.error,
							error_description: decision.error_description,
						});
					}
				}

				// The plugin issues a code without consent. Require the proof the
				// fork's consent page mints, and never let an anonymous request reach
				// the plugin (it would set a login-resume cookie that bypasses the
				// consent page after sign-in).
				if (ctx.path === "/mcp/authorize") {
					const session = await getSessionFromCtx(ctx);
					const decision = evaluateMcpAuthorizeGate({
						query: (ctx.query ?? {}) as Record<string, unknown>,
						userId: session?.user.id ?? null,
					});
					if (decision.action === "redirect") {
						throw ctx.redirect(decision.location);
					}
					if (decision.action === "reject") {
						throw new APIError("BAD_REQUEST", {
							error: decision.error,
							error_description: decision.error_description,
						});
					}
				}
			}),
			after: createAuthMiddleware(async (ctx) => {
				// Refresh rotation: the plugin inserts a new row and leaves the
				// consumed refresh token alive for its whole remaining window.
				// Clamp it to a short grace window so it cannot be replayed later
				// but an in-flight retry still succeeds.
				if (ctx.path !== "/mcp/token") return;
				const rawBody = ctx.body as unknown;
				const body =
					rawBody instanceof FormData
						? (Object.fromEntries(rawBody.entries()) as Record<string, unknown>)
						: ((rawBody ?? {}) as Record<string, unknown>);
				if (body.grant_type !== "refresh_token") return;
				const returned = ctx.context.returned as unknown;
				const succeeded =
					!!returned &&
					typeof returned === "object" &&
					"access_token" in returned;
				if (!succeeded) return;
				const consumed = body.refresh_token;
				if (typeof consumed === "string" && consumed) {
					// Hygiene only. The plugin has already rotated and the response
					// carries the new tokens; a failure here must not turn a
					// successful refresh into a 500 that makes the client drop its
					// grant and start a browser re-authorization.
					try {
						await consumeRotatedRefreshToken(consumed);
					} catch (error) {
						console.error("[mcp] failed to clamp rotated refresh token", error);
					}
				}
			}),
		},
		emailVerification: {
			sendOnSignUp: true,
			autoSignInAfterVerification: true,
			sendOnSignIn: true,
			sendVerificationEmail: async ({ user, url }) => {
				if (IS_CLOUD) {
					await sendVerificationEmail({
						userName: user.name || "User",
						email: user.email,
						verificationUrl: url,
					});
				}
			},
		},
		emailAndPassword: {
			enabled: true,
			autoSignIn: !IS_CLOUD,
			requireEmailVerification:
				IS_CLOUD && process.env.NODE_ENV === "production",
			password: {
				async hash(password) {
					return bcrypt.hashSync(password, 10);
				},
				async verify({ hash, password }) {
					return bcrypt.compareSync(password, hash);
				},
			},
			sendResetPassword: async ({ user, url }) => {
				await sendEmail({
					email: user.email,
					subject: "Reset your password",
					text: `
				<p>Click the link to reset your password: <a href="${url}">Reset Password</a></p>
				`,
				});
			},
		},
		databaseHooks: {
			user: {
				create: {
					before: async (_user, context) => {
						if (context?.path?.includes("/scim")) {
							return { data: { emailVerified: true } };
						}
						if (!IS_CLOUD) {
							const xDokployToken =
								context?.request?.headers?.get("x-dokploy-token");
							if (xDokployToken) {
								let invitation: Awaited<ReturnType<typeof getUserByToken>>;
								try {
									invitation = await getUserByToken(xDokployToken);
								} catch {
									throw new APIError("BAD_REQUEST", {
										message: "Invalid invitation token",
									});
								}
								if (invitation.isExpired) {
									throw new APIError("BAD_REQUEST", {
										message: "Invitation has expired",
									});
								}
								if (invitation.status !== "pending") {
									throw new APIError("BAD_REQUEST", {
										message: "Invitation has already been used",
									});
								}
								if (
									_user.email.toLowerCase().trim() !==
									invitation.email.toLowerCase().trim()
								) {
									throw new APIError("BAD_REQUEST", {
										message: "Email does not match invitation",
									});
								}
							} else {
								const isSSORequest = context?.path?.includes("/sso");
								if (isSSORequest) {
									return;
								}
								const isAdminPresent = await db.query.member.findFirst({
									where: eq(schema.member.role, "owner"),
								});
								if (isAdminPresent) {
									throw new APIError("BAD_REQUEST", {
										message: "Admin is already created",
									});
								}
							}
						}
					},
					after: async (user, context) => {
						const isSSORequest = context?.path?.includes("/sso");
						const isSCIMRequest = context?.path?.includes("/scim");
						const isAdminPresent = await db.query.member.findFirst({
							where: eq(schema.member.role, "owner"),
						});

						if (!IS_CLOUD && !isAdminPresent) {
							await updateWebServerSettings({
								serverIp: await getPublicIpWithFallback(),
							});
						}

						if (IS_CLOUD) {
							try {
								const hutk = getHubSpotUTK(
									context?.request?.headers?.get("cookie") || undefined,
								);
								// Cast to include additional fields
								const userWithFields = user as typeof user & {
									lastName?: string;
								};
								const hubspotSuccess = await submitToHubSpot(
									{
										email: user.email,
										firstName: user.name || "", // name is mapped to firstName column
										lastName: userWithFields.lastName || "",
									},
									hutk,
								);
								if (!hubspotSuccess) {
									console.error("Failed to submit to HubSpot");
								}
							} catch (error) {
								console.error("Error submitting to HubSpot", error);
							}
						}

						if (isSCIMRequest) {
							const membership = await db.query.member.findFirst({
								where: eq(schema.member.userId, user.id),
							});
							if (membership) {
								const defaultRole = await resolveOrganizationDefaultRole(
									membership.organizationId,
								);
								if (defaultRole !== membership.role) {
									await db
										.update(schema.member)
										.set({ role: defaultRole })
										.where(eq(schema.member.id, membership.id));
								}
							}
							return;
						}

						if (IS_CLOUD || !isAdminPresent) {
							await db.transaction(async (tx) => {
								const organization = await tx
									.insert(schema.organization)
									.values({
										name: "My Organization",
										ownerId: user.id,
										createdAt: new Date(),
									})
									.returning()
									.then((res) => res[0]);

								await tx.insert(schema.member).values({
									userId: user.id,
									organizationId: organization?.id || "",
									role: "owner",
									createdAt: new Date(),
									isDefault: true, // Mark first organization as default
								});
							});
						} else if (isSSORequest) {
							const providerId = context?.params?.providerId;
							if (!providerId) {
								throw new APIError("BAD_REQUEST", {
									message: "Provider ID is required",
								});
							}
							const provider = await db.query.ssoProvider.findFirst({
								where: eq(schema.ssoProvider.providerId, providerId),
							});

							if (!provider) {
								throw new APIError("BAD_REQUEST", {
									message: "Provider not found",
								});
							}
							const defaultRole = provider.organizationId
								? await resolveOrganizationDefaultRole(provider.organizationId)
								: "member";
							await db.insert(schema.member).values({
								userId: user.id,
								organizationId: provider?.organizationId || "",
								role: defaultRole,
								createdAt: new Date(),
								isDefault: true,
							});
						}
					},
				},
			},
			session: {
				create: {
					before: async (session) => {
						// Find the default organization for this user
						// Priority: 1) isDefault=true, 2) most recently created
						const member = await db.query.member.findFirst({
							where: eq(schema.member.userId, session.userId),
							orderBy: [
								desc(schema.member.isDefault),
								desc(schema.member.createdAt),
							],
							with: {
								organization: true,
							},
						});

						return {
							data: {
								...session,
								activeOrganizationId: member?.organization?.id,
							},
						};
					},
					after: async (session) => {
						const orgId = (
							session as typeof session & { activeOrganizationId?: string }
						).activeOrganizationId;
						if (!orgId) return;
						const memberRecord = await db.query.member.findFirst({
							where: and(
								eq(schema.member.userId, session.userId),
								eq(schema.member.organizationId, orgId),
							),
							with: { user: true },
						});
						if (!memberRecord) return;
						await createAuditLog({
							organizationId: orgId,
							userId: session.userId,
							userEmail: memberRecord.user.email,
							userRole: memberRecord.role,
							action: "login",
							resourceType: "session",
						});
					},
				},
				delete: {
					after: async (session) => {
						const orgId = (
							session as typeof session & { activeOrganizationId?: string }
						).activeOrganizationId;
						if (!orgId) return;
						const memberRecord = await db.query.member.findFirst({
							where: and(
								eq(schema.member.userId, session.userId),
								eq(schema.member.organizationId, orgId),
							),
							with: { user: true },
						});
						if (!memberRecord) return;
						await createAuditLog({
							organizationId: orgId,
							userId: session.userId,
							userEmail: memberRecord.user.email,
							userRole: memberRecord.role,
							action: "logout",
							resourceType: "session",
						});
					},
				},
			},
		},
		session: {
			// Sliding session lifetime, in days. Defaults to 30 (upstream ships 3,
			// which logs infrequent users out too aggressively for a dashboard).
			// Override per-install with DOKPLOY_SESSION_DAYS.
			expiresIn: 60 * 60 * 24 * getSessionDays(),
			// Refresh the sliding expiry at most once a day of use.
			updateAge: 60 * 60 * 24,
		},
		user: {
			modelName: "user",
			fields: {
				name: "firstName", // Map better-auth's default 'name' field to 'firstName' column
			},
			additionalFields: {
				role: {
					type: "string",
					// required: true,
					input: false,
				},
				ownerId: {
					type: "string",
					// required: true,
					input: false,
				},
				allowImpersonation: {
					fieldName: "allowImpersonation",
					type: "boolean",
					defaultValue: false,
				},
				lastName: {
					type: "string",
					required: false,
					input: true,
					defaultValue: "",
				},
				enableEnterpriseFeatures: {
					type: "boolean",
					required: false,
					input: false,
				},
				isValidEnterpriseLicense: {
					type: "boolean",
					required: false,
					input: false,
				},
			},
		},
		plugins: [
			apiKey({
				enableMetadata: true,
				references: "user",
			}),
			sso({ trustEmailVerified: true }),
			scim({
				beforeSCIMTokenGenerated: async ({ user, member }) => {
					// better-auth's /scim/generate-token also accepts a token with no
					// organizationId. Before @better-auth/scim 1.7, such a provider has no
					// owner binding and any user can take it over (GHSA-j8v8-g9cx-5qf4).
					// Dokploy only creates organization providers, so refuse the rest.
					if (!member) {
						throw new APIError("BAD_REQUEST", {
							message: "A SCIM provider must belong to an organization",
						});
					}
					const dbUser = await db.query.user.findFirst({
						where: eq(schema.user.id, user.id),
						columns: { enableEnterpriseFeatures: true },
					});

					if (!dbUser?.enableEnterpriseFeatures) {
						throw new APIError("FORBIDDEN", {
							message: "SCIM provisioning requires an enterprise license",
						});
					}
				},
			}),
			twoFactor(),
			passkey(),
			// Remote MCP endpoint OAuth server (see docs/superpowers/specs/2026-09-04-remote-mcp-oauth-design.md).
			// Discovery is served by the fork (apps/dokploy/pages/api/mcp-oauth/*), so no baseURL is set here.
			mcp({
				loginPage: MCP_AUTHORIZE_PAGE_PATH,
				resource: MCP_ENDPOINT_PATH,
				oidcConfig: {
					// OIDCOptions requires loginPage; the plugin overwrites it with the
					// top-level one, so both must name the fork's consent page.
					loginPage: MCP_AUTHORIZE_PAGE_PATH,
					accessTokenExpiresIn: getMcpAccessTokenSeconds(),
					refreshTokenExpiresIn: getMcpRefreshTokenSeconds(),
					requirePKCE: true,
					defaultScope: [
						"openid",
						"offline_access",
						...DOKPLOY_MCP_SCOPE_IDS,
					].join(" "),
					scopes: [...DOKPLOY_MCP_SCOPE_IDS],
				},
			}),
			organization({
				ac,
				roles: {
					owner: ownerRole,
					admin: adminRole,
					member: memberRole,
				},
				dynamicAccessControl: {
					enabled: true,
					maximumRolesPerOrganization: 10,
				},
			}),
			// Self-hosted needs the admin plugin too: SCIM deactivation (active: false)
			// maps to the admin plugin's `banned` field and is rejected without it.
			// adminRoles: [] keeps every /admin/* endpoint locked on self-hosted.
			admin(
				IS_CLOUD
					? {
							adminUserIds: [process.env.USER_ADMIN_ID as string].filter(
								Boolean,
							),
						}
					: { adminRoles: [] },
			),
		],
	});

// Una sola instancia de better-auth por proceso aunque el módulo esté
// duplicado en varios bundles.
type AuthInstance = ReturnType<typeof createBetterAuth>;

const globalForAuth = globalThis as unknown as {
	betterAuthInstance?: AuthInstance;
};

// Lazily initialize better-auth on first use instead of at module import
// time, so importing this module (or anything that re-exports it) no longer
// requires a reachable database.
function getAuthInstance(): AuthInstance {
	if (globalForAuth.betterAuthInstance) {
		return globalForAuth.betterAuthInstance;
	}

	try {
		globalForAuth.betterAuthInstance = createBetterAuth();
		return globalForAuth.betterAuthInstance;
	} catch (error) {
		console.error("Failed to initialize auth instance:", error);
		throw error;
	}
}

// Export properly typed lazy-loaded auth: each property defers to the
// singleton created on first access.
const _auth = {
	get handler() {
		return getAuthInstance().handler;
	},
	get createApiKey() {
		return getAuthInstance().api.createApiKey;
	},
	get registerSSOProvider() {
		return getAuthInstance().api.registerSSOProvider;
	},
	get updateSSOProvider() {
		return getAuthInstance().api.updateSSOProvider;
	},
	get generateSCIMToken() {
		return getAuthInstance().api.generateSCIMToken;
	},
	get listSCIMProviderConnections() {
		return getAuthInstance().api.listSCIMProviderConnections;
	},
	get deleteSCIMProviderConnection() {
		return getAuthInstance().api.deleteSCIMProviderConnection;
	},
};

export type AuthType = typeof _auth;
export const auth: AuthType = _auth;

// Access the underlying better-auth api lazily (used by validateRequest).
function getApi() {
	return getAuthInstance().api;
}

/**
 * Diagnostic for the "logged out early" reports: when a request carries a
 * session_token cookie but better-auth resolves no session, classify why by
 * looking the token up directly. Requests without a session cookie are normal
 * anonymous traffic and are not logged. Only a token prefix is logged — the
 * full token would allow session hijacking from log output.
 */
async function logRejectedSessionCookie(cookieHeader: string) {
	if (!cookieHeader) return;
	try {
		const sessionCookie = cookieHeader
			.split(";")
			.map((part) => part.trim())
			.find((part) => {
				const name = part.slice(0, part.indexOf("="));
				return (
					name.endsWith(".session_token") || name.endsWith("-session_token")
				);
			});
		if (!sessionCookie) return;
		const rawValue = decodeURIComponent(
			sessionCookie.slice(sessionCookie.indexOf("=") + 1),
		);
		const token = rawValue.split(".")[0] || "";
		if (!token) return;
		const row = await db.query.session.findFirst({
			where: eq(schema.session.token, token),
			columns: { token: true, expiresAt: true, userId: true },
		});
		const reason = !row
			? "token_not_in_db"
			: row.expiresAt <= new Date()
				? `expired_at=${row.expiresAt.toISOString()}`
				: "row_valid_but_rejected(signature_or_secret)";
		console.warn(
			`[session-diag] session cookie rejected: reason=${reason} tokenPrefix=${token.slice(0, 8)}`,
		);
	} catch (error) {
		console.warn("[session-diag] classification failed", error);
	}
}

type UserRow = typeof schema.user.$inferSelect;

/**
 * Synthesizes the `{ session, user }` shape tRPC's context expects for a
 * user acting inside one organization without a browser session. Shared by
 * the API-key branch of `validateRequest` and the MCP endpoint.
 */
export const buildMemberSession = async (
	userFromDb: UserRow,
	organizationId: string,
) => {
	const member = await db.query.member.findFirst({
		where: and(
			eq(schema.member.userId, userFromDb.id),
			eq(schema.member.organizationId, organizationId),
		),
		with: {
			organization: true,
		},
	});

	return {
		session: {
			userId: userFromDb.id,
			activeOrganizationId: organizationId,
		},
		user: {
			id: userFromDb.id,
			name: userFromDb.firstName, // Map firstName back to name for better-auth
			email: userFromDb.email,
			emailVerified: userFromDb.emailVerified,
			image: userFromDb.image,
			createdAt: userFromDb.createdAt,
			updatedAt: userFromDb.updatedAt,
			twoFactorEnabled: userFromDb.twoFactorEnabled,
			role: member?.role || "member",
			ownerId: member?.organization.ownerId || userFromDb.id,
			enableEnterpriseFeatures: userFromDb.enableEnterpriseFeatures,
			isValidEnterpriseLicense: userFromDb.isValidEnterpriseLicense,
		},
	};
};

/**
 * Outcome of checking a Dokploy API key. A key that is over its per-key rate
 * limit is still a good key, so it is reported apart from an invalid one:
 * callers that answer 401 for invalid keys should answer 429 for throttled
 * ones, or clients will treat a busy key as a lost login.
 */
export type ApiKeyVerification =
	| {
			status: "valid";
			member: Awaited<ReturnType<typeof buildMemberSession>>;
	  }
	| { status: "invalid" }
	| { status: "rate_limited"; retryAfterSeconds: number };

/** Seconds until a throttled key may retry, from better-auth's `tryAgainIn` (ms). */
const retryAfterSecondsFrom = (error: unknown) => {
	const source = error as {
		details?: { tryAgainIn?: unknown };
		tryAgainIn?: unknown;
	};
	const tryAgainIn = Number(source.details?.tryAgainIn ?? source.tryAgainIn);
	if (!Number.isFinite(tryAgainIn) || tryAgainIn <= 0) return 1;
	return Math.max(1, Math.ceil(tryAgainIn / 1000));
};

/**
 * Resolves a Dokploy API key to the member session of its owner inside the
 * organization the key was created for, telling a throttled key apart from
 * an unknown, expired, disabled or organization-less one.
 */
export const verifyApiKeyDetailed = async (
	apiKey: string,
): Promise<ApiKeyVerification> => {
	const api = getApi();
	try {
		const { valid, key, error } = await api.verifyApiKey({
			body: {
				key: apiKey,
			},
		});

		if (error) {
			if ((error as { code?: unknown }).code === "RATE_LIMITED") {
				return {
					status: "rate_limited",
					retryAfterSeconds: retryAfterSecondsFrom(error),
				};
			}
			throw new Error(error.message?.toString() || "Error verifying API key");
		}
		if (!valid || !key) {
			return { status: "invalid" };
		}

		const apiKeyRecord = await db.query.apikey.findFirst({
			where: eq(schema.apikey.id, key.id),
			with: {
				user: true,
			},
		});

		if (!apiKeyRecord) {
			return { status: "invalid" };
		}

		const organizationId = (
			JSON.parse(apiKeyRecord.metadata || "{}") as {
				organizationId?: string;
			}
		).organizationId;

		if (!organizationId) {
			return { status: "invalid" };
		}

		return {
			status: "valid",
			member: await buildMemberSession(apiKeyRecord.user, organizationId),
		};
	} catch (error) {
		console.error("Error verifying API key", error);
		return { status: "invalid" };
	}
};

/**
 * Resolves a Dokploy API key to the member session of its owner inside the
 * organization the key was created for. Null for unknown, expired, disabled,
 * throttled or organization-less keys. Used by the REST/tRPC `x-api-key` path;
 * the MCP endpoint uses {@link verifyApiKeyDetailed} to answer 429 on throttling.
 */
export const validateApiKey = async (apiKey: string) => {
	const verification = await verifyApiKeyDetailed(apiKey);
	return verification.status === "valid" ? verification.member : null;
};

export const validateRequest = async (request: IncomingMessage) => {
	const api = getApi();
	const apiKey = request.headers["x-api-key"] as string;
	if (apiKey) {
		return (
			(await validateApiKey(apiKey)) ?? {
				session: null,
				user: null,
			}
		);
	}

	// If no API key, proceed with normal session validation
	const session = await api.getSession({
		headers: new Headers({
			cookie: request.headers.cookie || "",
		}),
	});

	if (!session?.session || !session.user) {
		await logRejectedSessionCookie(request.headers.cookie || "");
		return {
			session: null,
			user: null,
		};
	}

	if (session?.user) {
		const member = await db.query.member.findFirst({
			where: and(
				eq(schema.member.userId, session.user.id),
				...(session.session.activeOrganizationId
					? [
							eq(
								schema.member.organizationId,
								session.session.activeOrganizationId || "",
							),
						]
					: []),
			),
			orderBy: [desc(schema.member.isDefault), desc(schema.member.createdAt)],
			with: {
				organization: true,
				user: true,
			},
		});

		session.user.role = member?.role || "member";
		session.user.enableEnterpriseFeatures =
			member?.user.enableEnterpriseFeatures || false;
		session.user.isValidEnterpriseLicense =
			member?.user.isValidEnterpriseLicense || false;
		session.session.activeOrganizationId = member?.organization.id || "";
		if (member) {
			session.user.ownerId = member.organization.ownerId;
		} else {
			session.user.ownerId = session.user.id;
		}
	}

	return session;
};
