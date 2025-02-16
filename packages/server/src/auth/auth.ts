import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { TimeSpan } from "lucia";
import { Lucia } from "lucia/dist/core.js";
import type { Session, User } from "lucia/dist/core.js";
import { db } from "../db";
import { type DatabaseUser, auth, session } from "../db/schema";

export const adapter = new DrizzlePostgreSQLAdapter(db, session, auth);

export const lucia = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: false,
		},
	},

	sessionExpiresIn: new TimeSpan(1, "d"),
	getUserAttributes: (attributes) => {
		return {
			email: attributes.email,
			rol: attributes.rol,
			secret: attributes.secret !== null,
			adminId: attributes.adminId,
		};
	},
});

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: Omit<DatabaseUser, "id"> & {
			authId: string;
			adminId: string;
		};
	}
}

export type ReturnValidateToken = Promise<{
	user: (User & { authId: string; adminId: string }) | null;
	session: Session | null;
}>;
