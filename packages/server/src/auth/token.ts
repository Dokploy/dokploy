import type { IncomingMessage } from "node:http";
import { TimeSpan } from "lucia";
import { Lucia } from "lucia/dist/core.js";
import { findAdminByAuthId } from "../services/admin";
import { findUserByAuthId } from "../services/user";
import { type ReturnValidateToken, adapter } from "./auth";

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

	if (result.user) {
		if (result.user?.rol === "admin") {
			const admin = await findAdminByAuthId(result.user.id);
			result.user.adminId = admin.adminId;
		} else if (result.user?.rol === "user") {
			const userResult = await findUserByAuthId(result.user.id);
			result.user.adminId = userResult.adminId;
		}
	}
	return {
		session: result.session,
		...((result.user && {
			user: {
				adminId: result.user.adminId,
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

export const validateBearerTokenAPI = async (
	authorizationHeader: string,
): ReturnValidateToken => {
	const sessionId = luciaToken.readBearerToken(authorizationHeader ?? "");
	if (!sessionId) {
		return {
			user: null,
			session: null,
		};
	}
	const result = await luciaToken.validateSession(sessionId);

	if (result.user) {
		if (result.user?.rol === "admin") {
			const admin = await findAdminByAuthId(result.user.id);
			result.user.adminId = admin.adminId;
		} else if (result.user?.rol === "user") {
			const userResult = await findUserByAuthId(result.user.id);
			result.user.adminId = userResult.adminId;
		}
	}
	return {
		session: result.session,
		...((result.user && {
			user: {
				adminId: result.user.adminId,
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
