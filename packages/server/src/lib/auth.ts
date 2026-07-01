import type { IncomingMessage } from "node:http";
import { apiKey } from "@better-auth/api-key";
import { sso } from "@better-auth/sso";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, organization, twoFactor } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import { getTrustedOrigins, getUserByToken } from "../services/admin";
import { checkPermission } from "../services/permission";
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

export const isEmailPasswordSignInPath = (path: string | undefined) =>
	path === "/sign-in/email" || path?.endsWith("/sign-in/email");

export const shouldBlockEmailPasswordSignIn = async (
	path: string | undefined,
) => {
	if (IS_CLOUD || !isEmailPasswordSignInPath(path)) {
		return false;
	}

	const settings = await getWebServerSettings();
	return settings?.enforceSSO === true;
};

const isSsoRegisterTrustedOriginsRequest = (request: Request | undefined) => {
	if (!request) return false;
	try {
		return new URL(request.url).pathname.endsWith("/sso/register");
	} catch {
		return false;
	}
};

const isProductionBuild = () =>
	process.env.NEXT_PHASE === "phase-production-build" ||
	(process.env.npm_lifecycle_event === "build-next" &&
		process.env.npm_lifecycle_script?.includes("next build"));

export const resolveTrustedOriginsForAuthRequest = async (
	request?: Request,
) => {
	if (isProductionBuild()) {
		return [];
	}

	try {
		const tenantTrustedOrigins = isSsoRegisterTrustedOriginsRequest(request)
			? await getTrustedOrigins()
			: [];

		if (IS_CLOUD) {
			return tenantTrustedOrigins;
		}

		const settings = await getWebServerSettings();
		if (!settings) return tenantTrustedOrigins;
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
			...tenantTrustedOrigins,
		];
	} catch (error) {
		console.error("Failed to resolve trusted origins:", error);
		return [];
	}
};

export const canProvisionSsoMembershipForEmail = (
	email: string | undefined,
	provider: {
		domain?: string | null;
		domainVerified?: boolean | null;
		organizationId?: string | null;
	},
): provider is {
	domain: string;
	domainVerified: true;
	organizationId: string;
} => {
	const emailDomain = email?.split("@")[1]?.trim().toLowerCase();
	if (
		!emailDomain ||
		!provider.organizationId ||
		provider.domainVerified !== true ||
		!provider.domain
	) {
		return false;
	}

	return provider.domain
		.split(",")
		.map((domain) => domain.trim().toLowerCase())
		.filter(Boolean)
		.some(
			(domain) => emailDomain === domain || emailDomain.endsWith(`.${domain}`),
		);
};

type SsoMembershipProvider = {
	domain?: string | null;
	domainVerified?: boolean | null;
	organizationId?: string | null;
	providerId?: string | null;
};

type SsoCreatedUser = {
	id: string;
	email?: string;
};

export const resolveSsoOrganizationProvisioningRole = async ({
	user,
	provider,
}: {
	user: SsoCreatedUser;
	userInfo?: Record<string, unknown>;
	provider: SsoMembershipProvider;
	token?: unknown;
}): Promise<"member"> => {
	if (!canProvisionSsoMembershipForEmail(user.email, provider)) {
		throw new APIError("UNAUTHORIZED", {
			message: "SSO email domain is not allowed for this provider",
		});
	}
	return "member";
};

export const provisionSsoMembershipForCreatedUser = async (
	user: SsoCreatedUser,
	providerId: string | undefined,
) => {
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
	if (!canProvisionSsoMembershipForEmail(user.email, provider)) {
		throw new APIError("UNAUTHORIZED", {
			message: "SSO email domain is not allowed for this provider",
		});
	}
	await db.insert(schema.member).values({
		userId: user.id,
		organizationId: provider.organizationId,
		role: "member",
		createdAt: new Date(),
		isDefault: true,
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
			trustedProviders: ["github", "google"],
			allowDifferentEmails: false,
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
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			if (await shouldBlockEmailPasswordSignIn(ctx.path)) {
				throw new APIError("FORBIDDEN", {
					message:
						"Email and password sign-in is disabled while SSO is enforced",
				});
			}
		}),
	},
	async trustedOrigins(request) {
		return resolveTrustedOriginsForAuthRequest(request);
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
						await provisionSsoMembershipForCreatedUser(user, providerId);
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
		sso({
			domainVerification: {
				enabled: true,
			},
			organizationProvisioning: {
				getRole: resolveSsoOrganizationProvisioningRole,
			},
		}),
		twoFactor(),
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

			if (!member) {
				return {
					session: null,
					user: null,
				};
			}

			await checkPermission(
				{
					user: { id: apiKeyRecord.user.id },
					session: { activeOrganizationId: organizationId },
				},
				{ api: ["read"] },
			);

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
					role: member.role,
					ownerId: member.organization.ownerId,
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
