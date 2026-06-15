import type { IncomingMessage } from "node:http";
import { apiKey } from "@better-auth/api-key";
import { passkey } from "@better-auth/passkey";
import { sso } from "@better-auth/sso";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	APIError,
	createAuthMiddleware,
	createEmailVerificationToken,
	isAPIError,
} from "better-auth/api";
import { deleteSessionCookie } from "better-auth/cookies";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import {
	getTrustedOrigins,
	getTrustedProviders,
	getUserByToken,
} from "../services/admin";
import { createAuditLog } from "../services/proprietary/audit-log";
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
import { resolvePasskeyRpConfig } from "./passkey-rp";

const passkeyRp = await resolvePasskeyRpConfig();

if (process.env.NODE_ENV === "development") {
	console.log("[passkey] resolved RP config:", {
		rpID: passkeyRp.rpID,
		origin: passkeyRp.origin,
	});
}

type PasskeyAuditSnapshot = { id: string; name?: string | null };

const resolveMemberForPasskeyAudit = async (
	userId: string,
	activeOrganizationId?: string | null,
) => {
	const memberRecord = await db.query.member.findFirst({
		where: and(
			eq(schema.member.userId, userId),
			...(activeOrganizationId
				? [eq(schema.member.organizationId, activeOrganizationId)]
				: []),
		),
		...(!activeOrganizationId
			? {
					orderBy: [
						desc(schema.member.isDefault),
						desc(schema.member.createdAt),
					],
				}
			: {}),
		with: { user: true },
	});
	if (!memberRecord) return null;
	return {
		organizationId: memberRecord.organizationId,
		userId,
		userEmail: memberRecord.user.email,
		userRole: memberRecord.role,
	};
};

type PasskeyVerifyReturned = {
	session?: { token: string; userId: string };
};

const handlePasskeyVerifyAuthenticationAfter = async (
	ctx: Parameters<Parameters<typeof createAuthMiddleware>[0]>[0],
) => {
	const returned = ctx.context.returned as PasskeyVerifyReturned | undefined;
	if (!returned?.session?.token || !returned.session.userId) return;

	const user = await db.query.user.findFirst({
		where: eq(schema.user.id, returned.session.userId),
	});
	if (!user) return;

	if (
		IS_CLOUD &&
		process.env.NODE_ENV === "production" &&
		ctx.context.options?.emailAndPassword?.requireEmailVerification &&
		!user.emailVerified
	) {
		if (!ctx.context.options?.emailVerification?.sendVerificationEmail) {
			deleteSessionCookie(ctx, true);
			await ctx.context.internalAdapter.deleteSession(returned.session.token);
			throw new APIError("FORBIDDEN", {
				code: "EMAIL_NOT_VERIFIED",
				message: "Email not verified",
			});
		}
		if (ctx.context.options?.emailVerification?.sendOnSignIn) {
			const token = await createEmailVerificationToken(
				ctx.context.secret,
				user.email,
				undefined,
				ctx.context.options.emailVerification?.expiresIn,
			);
			const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${encodeURIComponent("/")}`;
			await ctx.context.runInBackgroundOrAwait(
				ctx.context.options.emailVerification.sendVerificationEmail(
					{
						user: {
							id: user.id,
							email: user.email,
							emailVerified: user.emailVerified,
							name: user.firstName,
							image: user.image,
							createdAt: user.createdAt ?? new Date(),
							updatedAt: user.updatedAt,
						},
						url,
						token,
					},
					ctx.request,
				),
			);
		}
		deleteSessionCookie(ctx, true);
		await ctx.context.internalAdapter.deleteSession(returned.session.token);
		throw new APIError("FORBIDDEN", {
			code: "EMAIL_NOT_VERIFIED",
			message: "Email not verified",
		});
	}

	// A user-verifying passkey is already phishing-resistant multi-factor auth
	// (possession of the authenticator + biometric/PIN), so it satisfies 2FA on
	// its own. We intentionally do NOT issue a twoFactorRedirect here — the
	// session completes directly, matching how Google/Microsoft/GitHub/Apple
	// treat passkey sign-in. TOTP remains required for the email/password flow.
	return;
};

const auditPasskeyEvent = async (
	userId: string,
	activeOrganizationId: string | null | undefined,
	action: "create" | "delete",
	passkey: PasskeyAuditSnapshot,
) => {
	const member = await resolveMemberForPasskeyAudit(
		userId,
		activeOrganizationId,
	);
	if (!member) return;
	await createAuditLog({
		organizationId: member.organizationId,
		userId: member.userId,
		userEmail: member.userEmail,
		userRole: member.userRole,
		action,
		resourceType: "passkey",
		resourceId: passkey.id,
		resourceName: passkey.name ?? undefined,
	});
};

const { handler, api } = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	disabledPaths: [
		"/sso/register",
		"/organization/create",
		"/organization/update",
		"/organization/delete",
		...(!IS_CLOUD ? ["/verify-email"] : []),
	],
	secret: betterAuthSecret,
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
	async trustedOrigins() {
		try {
			if (IS_CLOUD) {
				return await getTrustedOrigins();
			}
			const [trustedOrigins, settings] = await Promise.all([
				getTrustedOrigins(),
				getWebServerSettings(),
			]);
			if (!settings) return [];
			const port = process.env.PORT ?? "3000";
			const portSuffix = port !== "3000" ? `:${port}` : "";
			const envPublicUrl =
				process.env.BETTER_AUTH_URL?.trim() ||
				process.env.NEXT_PUBLIC_APP_URL?.trim() ||
				"";
			const devOrigins =
				process.env.NODE_ENV === "development"
					? [
							`http://localhost:${port}`,
							`http://127.0.0.1:${port}`,
							...(envPublicUrl
								? [envPublicUrl.replace(/\/$/, "")]
								: []),
							"https://absolutely-handy-falcon.ngrok-free.app",
						]
					: [];
			const hostOrigins = settings?.host
				? [
						`https://${settings.host}${portSuffix}`,
						`http://${settings.host}${portSuffix}`,
					]
				: [];
			const origins = [
				...(settings?.serverIp
					? [`http://${settings.serverIp}:${port}`]
					: []),
				...hostOrigins,
				...devOrigins,
				...trustedOrigins,
				passkeyRp.origin,
			];
			return [...new Set(origins)];
		} catch (error) {
			console.error("Failed to resolve trusted origins:", error);
			return [];
		}
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
		requireEmailVerification: IS_CLOUD && process.env.NODE_ENV === "production",
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
							const isSSORequest = context?.path.includes("/sso");
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
					const isSSORequest = context?.path.includes("/sso");
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
						await db.insert(schema.member).values({
							userId: user.id,
							organizationId: provider?.organizationId || "",
							role: "member",
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
							activeOrganizationId: member?.organization.id,
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
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (ctx.path !== "/passkey/delete-passkey") return;
			const id = (ctx.body as { id?: string } | undefined)?.id;
			if (!id) return;
			const record = await db.query.passkey.findFirst({
				where: eq(schema.passkey.id, id),
			});
			if (!record) return;
			(
				ctx.context as typeof ctx.context & {
					passkeyAuditSnapshot?: PasskeyAuditSnapshot;
				}
			).passkeyAuditSnapshot = {
				id: record.id,
				name: record.name,
			};
		}),
		after: createAuthMiddleware(async (ctx) => {
			if (isAPIError(ctx.context.returned)) return;

			if (ctx.path === "/passkey/verify-authentication") {
				const passkeyResult = await handlePasskeyVerifyAuthenticationAfter(ctx);
				if (passkeyResult !== undefined) return passkeyResult;
			}

			const session = ctx.context.session;
			const activeOrganizationId = session?.session?.activeOrganizationId;

			if (ctx.path === "/passkey/verify-registration") {
				const passkey = ctx.context.returned as
					| PasskeyAuditSnapshot
					| undefined;
				if (!passkey?.id) return;
				if (!session?.user?.id) return;
				await auditPasskeyEvent(
					session.user.id,
					activeOrganizationId,
					"create",
					passkey,
				);
				return;
			}

			if (ctx.path === "/passkey/delete-passkey") {
				const result = ctx.context.returned as { status?: boolean } | undefined;
				if (!result?.status) return;
				const snapshot = (
					ctx.context as typeof ctx.context & {
						passkeyAuditSnapshot?: PasskeyAuditSnapshot;
					}
				).passkeyAuditSnapshot;
				const id =
					snapshot?.id ?? (ctx.body as { id?: string } | undefined)?.id;
				if (!id || !session?.user?.id) return;
				await auditPasskeyEvent(
					session.user.id,
					activeOrganizationId,
					"delete",
					{ id, name: snapshot?.name },
				);
			}
		}),
	},
	session: {
		expiresIn: 60 * 60 * 24 * 3,
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
		sso(),
		twoFactor(),
		passkey({
			rpID: passkeyRp.rpID,
			rpName: passkeyRp.rpName,
			// null origin: verify step uses the request Origin header (must match browser URL)
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
		...(IS_CLOUD
			? [
					admin({
						adminUserIds: [process.env.USER_ADMIN_ID as string],
					}),
				]
			: []),
	],
});

const _auth = {
	handler,
	createApiKey: api.createApiKey,
	registerSSOProvider: api.registerSSOProvider,
	updateSSOProvider: api.updateSSOProvider,
};

export type AuthType = typeof _auth;
export const auth: AuthType = _auth;

export const validateRequest = async (request: IncomingMessage) => {
	const apiKey = request.headers["x-api-key"] as string;
	if (apiKey) {
		try {
			const { valid, key, error } = await api.verifyApiKey({
				body: {
					key: apiKey,
				},
			});

			if (error) {
				throw new Error(error.message?.toString() || "Error verifying API key");
			}
			if (!valid || !key) {
				return {
					session: null,
					user: null,
				};
			}

			const apiKeyRecord = await db.query.apikey.findFirst({
				where: eq(schema.apikey.id, key.id),
				with: {
					user: true,
				},
			});

			if (!apiKeyRecord) {
				return {
					session: null,
					user: null,
				};
			}

			const organizationId = (
				JSON.parse(apiKeyRecord.metadata || "{}") as {
					organizationId?: string;
				}
			).organizationId;

			if (!organizationId) {
				return {
					session: null,
					user: null,
				};
			}

			const member = await db.query.member.findFirst({
				where: and(
					eq(schema.member.userId, apiKeyRecord.user.id),
					eq(schema.member.organizationId, organizationId),
				),
				with: {
					organization: true,
				},
			});

			// When accessing from DB, use actual column names
			const userFromDb = apiKeyRecord.user as typeof apiKeyRecord.user & {
				firstName: string;
				lastName: string;
			};

			const mockSession = {
				session: {
					userId: apiKeyRecord.user.id,
					activeOrganizationId: organizationId || "",
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
					ownerId: member?.organization.ownerId || apiKeyRecord.user.id,
					enableEnterpriseFeatures: userFromDb.enableEnterpriseFeatures,
					isValidEnterpriseLicense: userFromDb.isValidEnterpriseLicense,
				},
			};

			return mockSession;
		} catch (error) {
			console.error("Error verifying API key", error);
			return {
				session: null,
				user: null,
			};
		}
	}

	// If no API key, proceed with normal session validation
	const session = await api.getSession({
		headers: new Headers({
			cookie: request.headers.cookie || "",
		}),
	});

	if (!session?.session || !session.user) {
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
