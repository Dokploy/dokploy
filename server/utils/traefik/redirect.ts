import type { Redirect } from "@/server/api/services/redirect";
import { loadOrCreateConfig, writeTraefikConfig } from "./application";
import type { FileConfig } from "./file-types";
import {
	addMiddleware,
	deleteMiddleware,
	loadMiddlewares,
	writeMiddleware,
} from "./middleware";

export const updateRedirectMiddleware = (appName: string, data: Redirect) => {
	const config = loadMiddlewares<FileConfig>();

	if (config?.http?.middlewares?.[appName]) {
		const middlewareName = `${appName}-${data.uniqueConfigKey}`;

		config.http.middlewares[middlewareName] = {
			redirectRegex: {
				regex: data.regex,
				replacement: data.replacement,
				permanent: data.permanent,
			},
		};
	}

	writeMiddleware(config);
};
export const createRedirectMiddleware = (appName: string, data: Redirect) => {
	const config = loadMiddlewares<FileConfig>();
	const middlewareName = `redirect-${appName}-${data.uniqueConfigKey}`;
	const newMiddleware = {
		[middlewareName]: {
			redirectRegex: {
				regex: data.regex,
				replacement: data.replacement,
				permanent: data.permanent,
			},
		},
	};

	if (config?.http) {
		config.http.middlewares = {
			...config.http.middlewares,
			...newMiddleware,
		};
	}

	const appConfig = loadOrCreateConfig(appName);

	addMiddleware(appConfig, middlewareName);

	writeTraefikConfig(appConfig, appName);
	writeMiddleware(config);
};

export const removeRedirectMiddleware = (appName: string, data: Redirect) => {
	const config = loadMiddlewares<FileConfig>();
	const middlewareName = `redirect-${appName}-${data.uniqueConfigKey}`;

	if (config?.http?.middlewares?.[middlewareName]) {
		delete config.http.middlewares[middlewareName];
	}

	const appConfig = loadOrCreateConfig(appName);

	deleteMiddleware(appConfig, middlewareName);
	writeTraefikConfig(appConfig, appName);
	writeMiddleware(config);
};
