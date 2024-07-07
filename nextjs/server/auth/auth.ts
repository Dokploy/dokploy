import { Lucia } from "lucia/dist/core.js";
import { webcrypto } from "node:crypto";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";
import type { Session, User } from "lucia/dist/core.js";
import type { IncomingMessage, ServerResponse } from "node:http";
import { auth, type DatabaseUser, sessionTable } from "../db/schema";
import { db } from "../db";
import { TimeSpan } from "lucia";

globalThis.crypto = webcrypto as Crypto;
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
		};
	},
});

declare module "lucia" {
	interface Register {
		Lucia: typeof lucia;
		DatabaseUserAttributes: Omit<DatabaseUser, "id"> & { authId: string };
	}
}

export type ReturnValidateToken = Promise<{
	user: (User & { authId: string }) | null;
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
	return {
		session: result.session,
		...((result.user && {
			user: {
				authId: result.user.id,
				email: result.user.email,
				rol: result.user.rol,
				id: result.user.id,
				secret: result.user.secret,
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
