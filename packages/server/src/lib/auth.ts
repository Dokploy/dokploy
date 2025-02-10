import type { IncomingMessage } from "node:http";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, createAuthMiddleware, organization } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
export const auth = betterAuth({
	database: drizzleAdapter(db, {
		provider: "pg",
		schema: schema,
	}),
	emailAndPassword: {
		enabled: true,
	},
	hooks: {
		after: createAuthMiddleware(async (ctx) => {
			if (ctx.path.startsWith("/sign-up")) {
				const newSession = ctx.context.newSession;
				await db
					.update(schema.user)
					.set({
						role: "admin",
					})
					.where(eq(schema.user.id, newSession?.user?.id || ""));
			}
		}),
	},
	user: {
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
