import { Lucia } from "lucia/dist/core.js";
import type { IncomingMessage } from "node:http";
import { TimeSpan } from "lucia";
import { adapter, type ReturnValidateToken } from "./auth";

export const luciaToken = new Lucia(adapter, {
	sessionCookie: {
		attributes: {
			secure: false,
		},
	},
	sessionExpiresIn: new TimeSpan(365, "d"),
	getUserAttributes: (attributes) => {
		return {
			email: attributes.email,
			rol: attributes.rol,
			secret: attributes.secret !== null,
		};
	},
});

export const validateBearerToken = async (
	req: IncomingMessage,
): ReturnValidateToken => {
	const authorizationHeader = req.headers.authorization;
	const sessionId = luciaToken.readBearerToken(authorizationHeader ?? "");
	if (!sessionId) {
		return {
			user: null,
			session: null,
		};
	}
	const result = await luciaToken.validateSession(sessionId);
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
};
