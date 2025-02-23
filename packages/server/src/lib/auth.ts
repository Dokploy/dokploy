import type { IncomingMessage } from "node:http";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import {
	createAuthMiddleware,
	organization,
	twoFactor,
} from "better-auth/plugins";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

export const auth = betterAuth({
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
	emailAndPassword: {
		enabled: true,

		password: {
			async hash(password) {
				return bcrypt.hashSync(password, 10);
			},
			async verify({ hash, password }) {
				return bcrypt.compareSync(password, hash);
			},
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path.startsWith("/sign-up")) {
				const newSession = ctx.context.newSession;
				if (ctx.headers?.get("x-dokploy-token")) {
				} else {
					const organization = await db
						.insert(schema.organization)
						.values({
							name: "My Organization",
							ownerId: newSession?.user?.id || "",
							createdAt: new Date(),
						})
						.returning()
						.then((res) => res[0]);

					await db.insert(schema.member).values({
						userId: newSession?.user?.id || "",
						organizationId: organization?.id || "",
						role: "owner",
						createdAt: new Date(),
					});
				}
			}
		}),
	},
	databaseHooks: {
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
		},
	},

	plugins: [
		twoFactor(),
		organization({
			async sendInvitationEmail(data, request) {
				const inviteLink = `https://example.com/accept-invitation/${data.id}`;
				// https://example.com/accept-invitation/8jlBi9Tb9isDb8mc8Sb85u1BaJYklKB2
				// sendOrganizationInvitation({
				// 		email: data.email,
				// 		invitedByUsername: data.inviter.user.name,
				// 		invitedByEmail: data.inviter.user.email,
				// 		teamName: data.organization.name,
				// 		inviteLink
				// 	})
				console.log("Invitation link", inviteLink);
			},
		}),
	],
});

export const validateRequest = async (request: IncomingMessage) => {
	const session = await auth.api.getSession({
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
				eq(
					schema.member.organizationId,
					session.session.activeOrganizationId || "",
				),
			),
			with: {
				organization: true,
			},
		});

		session.user.role = member?.role || "member";
		if (member) {
			session.user.ownerId = member.organization.ownerId;
		} else {
			session.user.ownerId = session.user.id;
		}
	}

	return session;
};
