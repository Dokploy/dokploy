import type { IncomingMessage } from "node:http";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, createAuthMiddleware, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { Scrypt } from "lucia";
const scrypt = new Scrypt();

export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
		password: {
			hash: scrypt.hash,
			verify: scrypt.verify,
		},
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path.startsWith("/sign-up")) {
				const newSession = ctx.context.newSession;
				await db
					.update(schema.users_temp)
					.set({
						role: "admin",
					})
					.where(eq(schema.users_temp.id, newSession?.user?.id || ""));
			}
		}),
	},
	user: {
		modelName: "users_temp",
		additionalFields: {},
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

	return session;
};
