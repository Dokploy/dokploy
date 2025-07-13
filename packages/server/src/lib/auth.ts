import type { IncomingMessage } from "node:http";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { admin, apiKey, organization, twoFactor } from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { db } from "../db";
import * as schema from "../db/schema";
import { getUserByToken } from "../services/admin";
import { sendEmail } from "../verification/send-verification-email";
import { getPublicIpWithFallback } from "../wss/utils";
import { createDefaultRoles } from "../services/role";
import {
	findWebServer,
	updateWebServer,
} from "@dokploy/server/services/web-server";

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
	...(!IS_CLOUD && {
		async trustedOrigins() {
			const admin = await findWebServer();

			if (admin) {
				return [
					...(admin.serverIp ? [`http://${admin.serverIp}:3000`] : []),
					...(admin.host ? [`https://${admin.host}`] : []),
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
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path === "/organization/accept-invitation") {
				const invitationId = ctx.body.invitationId;

				if (invitationId) {
					const user = await getUserByToken(invitationId);
					if (!user) {
						throw new APIError("BAD_REQUEST", {
							message: "User not found",
						});
					}

					const role = await db.query.role.findFirst({
						where: and(
							eq(schema.role.name, user.role || "member"),
							eq(schema.role.organizationId, user.organizationId),
						),
					});

					const userTemp = await db.query.users.findFirst({
						where: eq(schema.users.email, user.email),
					});

					const member = await db.query.member.findFirst({
						where: and(
							eq(schema.member.userId, userTemp?.id || ""),
							eq(schema.member.organizationId, user.organizationId),
						),
					});

					await db
						.update(schema.member)
						.set({
							roleId: role?.roleId || "",
						})
						.where(eq(schema.member.userId, member?.userId || ""))
						.returning();
				}
			}
		}),
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
							const ownerRole = await db.query.role.findFirst({
								where: and(eq(schema.role.name, "owner")),
							});

							if (!ownerRole) {
								throw new APIError("BAD_REQUEST", {
									message: "Owner role not found",
								});
							}

							const isAdminPresent = await db.query.member.findFirst({
								where: and(eq(schema.member.roleId, ownerRole.roleId)),
							});
							if (isAdminPresent) {
								throw new APIError("BAD_REQUEST", {
									message: "Admin is already created",
								});
							}
						}
					}
				},
				after: async (user) => {
					const ownerRole = await db.query.role.findFirst({
						where: and(eq(schema.role.name, "owner")),
					});
					const isAdminPresent = await db.query.member.findFirst({
						where: and(eq(schema.member.roleId, ownerRole?.roleId || "")),
					});

					if (!IS_CLOUD) {
						await updateWebServer({
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

							await createDefaultRoles(organization?.id || "");

							const ownerRole = await tx.query.role.findFirst({
								where: and(
									eq(schema.role.name, "owner"),
									eq(schema.role.organizationId, organization?.id || ""),
								),
							});

							await tx.insert(schema.member).values({
								userId: user.id,
								organizationId: organization?.id || "",
								createdAt: new Date(),
								roleId: ownerRole?.roleId || "",
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
							role: true,
							organization: true,
						},
					});

					console.log(member);

					return {
						data: {
							...session,
							activeOrganizationId: member?.organization.id,
							roleId: member?.roleId,
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
		modelName: "users",
		additionalFields: {
			roleId: {
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
					role: true,
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
					user: {
						id: apiKeyRecord.user.id,
						email: apiKeyRecord.user.email,
						name: apiKeyRecord.user.name,
					},
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
					role: member?.role,
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
		return {
			session: null,
			user: null,
		};
	}

	const mockSession = {
		session: {
			...session.session,
		},
		user: {
			...session.user,
			ownerId: session.user.ownerId,
		},
	};
	if (session?.user) {
		const member = await db.query.member.findFirst({
			where: and(
				eq(schema.member.userId, session.user.id),
				eq(
					schema.member.organizationId,
					session.session.activeOrganizationId || "",
				),
			),
			with: {
				role: true,
				organization: true,
			},
		});

		if (member?.role) {
			mockSession.user.role = member.role;
		}

		if (member) {
			mockSession.user.ownerId = member.organization.ownerId;
		} else {
			mockSession.user.ownerId = session.user.id;
		}
	}

	return mockSession;
};
