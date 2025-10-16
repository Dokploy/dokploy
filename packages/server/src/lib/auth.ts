import type { IncomingMessage } from "node:http";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { sso } from "@better-auth/sso";
import { admin, apiKey, organization, twoFactor } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import { getUserByToken } from "../services/admin";
import { updateUser } from "../services/user";
import { sendEmail } from "../verification/send-verification-email";
import { getPublicIpWithFallback } from "../wss/utils";

const { handler, api } = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
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
	...(!IS_CLOUD && {
		async trustedOrigins() {
			const admin = await db.query.member.findFirst({
				where: eq(schema.member.role, "owner"),
				with: {
					user: true,
				},
			});

			if (admin) {
				return [
					...(admin.user.serverIp
						? [`http://${admin.user.serverIp}:3000`]
						: []),
					...(admin.user.host ? [`https://${admin.user.host}`] : []),
				];
			}
			return [];
		},
	}),
	emailVerification: {
		sendOnSignUp: true,
		autoSignInAfterVerification: true,
		sendVerificationEmail: async ({ user, url }) => {
			if (IS_CLOUD) {
				await sendEmail({
					email: user.email,
					subject: "Verify your email",
					text: `
				<p>Click the link to verify your email: <a href="${url}">Verify Email</a></p>
				`,
				});
			}
		},
	},
	emailAndPassword: {
		enabled: true,
		autoSignIn: !IS_CLOUD,
		requireEmailVerification: IS_CLOUD,
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
							const user = await getUserByToken(xDokployToken);
							if (!user) {
								throw new APIError("BAD_REQUEST", {
									message: "User not found",
								});
							}
						} else {
							const isAdminPresent = await db.query.member.findFirst({
								where: eq(schema.member.role, "owner"),
							});
							if (isAdminPresent) {
								// Allow SSO / OIDC flows to proceed by linking to existing user if email matches.
								try {
									const incomingEmail = (/** @ts-ignore */ _user as any)?.email;
									if (incomingEmail) {
										const existingUser = await db.query.users_temp.findFirst({
											where: eq(schema.users_temp.email, incomingEmail),
										});
										if (existingUser) {
											console.warn("[auth] Skipping new user creation – linking SSO to existing user", incomingEmail);
											return; // Skip blocking – Better Auth will attach / update account record.
										}
									}
									// Heuristic: if the request URL indicates SSO callback or sign-in, allow it.
									const reqUrl = context?.request?.url || "";
									if (reqUrl.includes("/auth/sso") || reqUrl.includes("/sign-in/sso")) {
										console.warn("[auth] Allowing SSO user creation despite existing admin (SSO flow)");
										return;
									}
								} catch (e) {
									console.error("[auth] Error while checking existing user for SSO linking", e);
								}

								// Fallback: block additional local (non-SSO) first-user creations.
								throw new APIError("BAD_REQUEST", {
									message: "Admin is already created",
								});
							}
						}
					}
				},
				after: async (user) => {
					// Enrich freshly created user with OIDC claims if available
					try {
						// We rely on an existing account row containing idToken; fetch it
						const accountRow = await db.query.account.findFirst({
							where: and(
								eq(schema.account.userId, user.id),
								eq(schema.account.providerId, "oidc"),
							),
						});
						if (accountRow?.idToken) {
							const tokenParts = accountRow.idToken.split(".");
							if (tokenParts.length === 3 && tokenParts[1]) {
								const payloadRaw = Buffer.from(tokenParts[1]!, "base64").toString("utf8");
								let payload: any = {};
								try {
									payload = JSON.parse(payloadRaw);
								} catch {
									// ignore malformed token
								}
								const displayName = payload.name || [payload.given_name, payload.family_name].filter(Boolean).join(" ");
								const image = payload.picture;
								const emailVerified = payload.email_verified === true;
								const updates: Record<string, any> = {};
								if (displayName && !user.name) updates.name = displayName;
								if (typeof emailVerified === "boolean" && !user.emailVerified) updates.emailVerified = emailVerified;
								if (image && !user.image) updates.image = image;
								if (Object.keys(updates).length) {
									await updateUser(user.id, updates);
								}
							}
						}
					} catch (e) {
						console.warn("[auth] OIDC enrichment failed", e);
					}
					const isAdminPresent = await db.query.member.findFirst({
						where: eq(schema.member.role, "owner"),
					});

					if (!IS_CLOUD) {
						await updateUser(user.id, {
							serverIp: await getPublicIpWithFallback(),
						});
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
							});
						});
					}
				},
			},
		},
		session: {
			create: {
				before: async (session) => {
					const member = await db.query.member.findFirst({
						where: eq(schema.member.userId, session.userId),
						orderBy: desc(schema.member.createdAt),
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
			},
		},
	},
	session: {
		expiresIn: 60 * 60 * 24 * 3,
		updateAge: 60 * 60 * 24,
	},
	user: {
		modelName: "users_temp",
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
		},
	},
	plugins: [
		apiKey({
			enableMetadata: true,
		}),
		twoFactor(),
		organization({
			async sendInvitationEmail(data, _request) {
				if (IS_CLOUD) {
					const host =
						process.env.NODE_ENV === "development"
							? "http://localhost:3000"
							: "https://app.dokploy.com";
					const inviteLink = `${host}/invitation?token=${data.id}`;

					await sendEmail({
						email: data.email,
						subject: "Invitation to join organization",
						text: `
					<p>You are invited to join ${data.organization.name} on Dokploy. Click the link to accept the invitation: <a href="${inviteLink}">Accept Invitation</a></p>
					`,
					});
				}
			},
		}),
		sso({
			trustEmailVerified: true,
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

export const auth = {
	handler,
	createApiKey: api.createApiKey,
};

export const authApi = api;

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
				throw new Error(error.message || "Error verifying API key");
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

			const organizationId = JSON.parse(
				apiKeyRecord.metadata || "{}",
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

			const {
				id,
				name,
				email,
				emailVerified,
				image,
				createdAt,
				updatedAt,
				twoFactorEnabled,
			} = apiKeyRecord.user;

			const mockSession = {
				session: {
					userId: apiKeyRecord.user.id,
					activeOrganizationId: organizationId || "",
				},
				user: {
					id,
					name,
					email,
					emailVerified,
					image,
					createdAt,
					updatedAt,
					twoFactorEnabled,
					role: member?.role || "member",
					ownerId: member?.organization.ownerId || apiKeyRecord.user.id,
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
		return { session: null, user: null };
	}

	// Resolve or assign active organization id
	let activeOrgId = session.session.activeOrganizationId || "";
	const userId = session.user.id;

	// Try to find any membership if none active
	if (!activeOrgId) {
		const anyMember = await db.query.member.findFirst({
			where: eq(schema.member.userId, userId),
		});
		if (anyMember) {
			activeOrgId = anyMember.organizationId;
		} else {
			// If no membership exists, attach user to existing owner org (or create if none)
			const existingOwnerMember = await db.query.member.findFirst({
				where: eq(schema.member.role, "owner"),
				with: { organization: true },
			});
			if (existingOwnerMember) {
				await db.insert(schema.member).values({
					id: crypto.randomUUID(),
					organizationId: existingOwnerMember.organizationId,
					userId,
					role: "member",
					createdAt: new Date(),
				});
				activeOrgId = existingOwnerMember.organizationId;
			} else {
				// Last resort: create a fresh organization for this user
				const orgId = crypto.randomUUID();
				await db.transaction(async (tx) => {
					await tx.insert(schema.organization).values({
						id: orgId,
						name: "My Organization",
						ownerId: userId,
						createdAt: new Date(),
					});
					await tx.insert(schema.member).values({
						id: crypto.randomUUID(),
						organizationId: orgId,
						userId,
						role: "owner",
						createdAt: new Date(),
					});
				});
				activeOrgId = orgId;
			}
		}
	}

	// Fetch member for final role/owner assignment
	const member = await db.query.member.findFirst({
		where: and(
			eq(schema.member.userId, userId),
			eq(schema.member.organizationId, activeOrgId),
		),
		with: { organization: true },
	});

	session.session.activeOrganizationId = activeOrgId;
	session.user.role = member?.role || session.user.role || "member";
	session.user.ownerId = member?.organization?.ownerId || session.user.id;

	return session;
};
