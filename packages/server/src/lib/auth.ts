import type { IncomingMessage } from "node:http";
import * as bcrypt from "bcrypt";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware, organization } from "better-auth/plugins";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),

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
				required: true,
			},
			ownerId: {
				type: "string",
				required: true,
			},
		},
	},
	plugins: [organization()],
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
			where: eq(schema.member.userId, session.user.id),
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
