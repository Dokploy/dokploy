import type { IncomingMessage, ServerResponse } from "node:http";
import { findAdminByAuthId } from "@dokploy/server/services/admin";
import { findUserByAuthId } from "@dokploy/server/services/user";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import { TimeSpan } from "lucia";
import { Lucia } from "lucia/dist/core.js";
import type { Session, User } from "lucia/dist/core.js";
import { db } from "../db";
import { type DatabaseUser, auth, sessionTable } from "../db/schema";

export const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable, auth);

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

export async function validateRequest(
	req: IncomingMessage,
	res: ServerResponse,
): ReturnValidateToken {
	const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");

	if (!sessionId) {
		return {
			user: null,
			session: null,
		};
	}
	const result = await lucia.validateSession(sessionId);
	if (result?.session?.fresh) {
		res.appendHeader(
			"Set-Cookie",
			lucia.createSessionCookie(result.session.id).serialize(),
		);
	}
	if (!result.session) {
		res.appendHeader(
			"Set-Cookie",
			lucia.createBlankSessionCookie().serialize(),
		);
	}
	if (result.user) {
		try {
			if (result.user?.rol === "admin") {
				const admin = await findAdminByAuthId(result.user.id);
				result.user.adminId = admin.adminId;
			} else if (result.user?.rol === "user") {
				const userResult = await findUserByAuthId(result.user.id);
				result.user.adminId = userResult.adminId;
			}
		} catch (error) {
			return {
				user: null,
				session: null,
			};
		}
	}

	return {
		session: result.session,
		...((result.user && {
			user: {
				authId: result.user.id,
				email: result.user.email,
				rol: result.user.rol,
				id: result.user.id,
				secret: result.user.secret,
				adminId: result.user.adminId,
			},
		}) || {
			user: null,
		}),
	};
}

export async function validateWebSocketRequest(
	req: IncomingMessage,
): Promise<{ user: User; session: Session } | { user: null; session: null }> {
	const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");

	if (!sessionId) {
		return {
			user: null,
			session: null,
		};
	}
	const result = await lucia.validateSession(sessionId);
	return result;
}
