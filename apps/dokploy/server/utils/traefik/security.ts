import type { Security } from "@dokploy/server/api/services/security";
import * as bcrypt from "bcrypt";
import { loadOrCreateConfig, writeTraefikConfig } from "./application";
import type {
	BasicAuthMiddleware,
	FileConfig,
	HttpMiddleware,
} from "./file-types";
import {
	addMiddleware,
	deleteMiddleware,
	loadMiddlewares,
	writeMiddleware,
} from "./middleware";

export const createSecurityMiddleware = async (
	appName: string,
	data: Security,
) => {
	const config = loadMiddlewares<FileConfig>();
	const middlewareName = `auth-${appName}`;

	const user = `${data.username}:${await bcrypt.hash(data.password, 10)}`;

	if (config.http?.middlewares) {
		const currentMiddleware = config.http.middlewares[middlewareName];
		if (isBasicAuthMiddleware(currentMiddleware)) {
			currentMiddleware.basicAuth.users = [
				...(currentMiddleware.basicAuth.users || []),
				user,
			];
		} else {
			config.http.middlewares[middlewareName] = {
				basicAuth: {
					removeHeader: true,
					users: [user],
				},
			};
		}
	}

	const appConfig = loadOrCreateConfig(appName);

	addMiddleware(appConfig, middlewareName);
	writeTraefikConfig(appConfig, appName);
	writeMiddleware(config);
};

export const removeSecurityMiddleware = (appName: string, data: Security) => {
	const config = loadMiddlewares<FileConfig>();
	const appConfig = loadOrCreateConfig(appName);
	const middlewareName = `auth-${appName}`;

	if (config.http?.middlewares) {
		const currentMiddleware = config.http.middlewares[middlewareName];
		if (isBasicAuthMiddleware(currentMiddleware)) {
			const users = currentMiddleware.basicAuth.users;
			const filteredUsers =
				users?.filter((user) => {
					const [username] = user.split(":");
					return username !== data.username;
				}) || [];
			currentMiddleware.basicAuth.users = filteredUsers;

			if (filteredUsers.length === 0) {
				if (config?.http?.middlewares?.[middlewareName]) {
					delete config.http.middlewares[middlewareName];
				}
				deleteMiddleware(appConfig, middlewareName);
				writeTraefikConfig(appConfig, appName);
			}
		}
	}

	writeMiddleware(config);
};

const isBasicAuthMiddleware = (
	middleware: HttpMiddleware | undefined,
): middleware is { basicAuth: BasicAuthMiddleware } => {
	return !!middleware && "basicAuth" in middleware;
};
