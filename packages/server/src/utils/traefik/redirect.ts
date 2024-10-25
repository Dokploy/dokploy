import type { Redirect } from "@dokploy/server/services/redirect";
import type { ApplicationNested } from "../builders";
import {
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig } from "./file-types";
import {
	addMiddleware,
	deleteMiddleware,
	loadMiddlewares,
	loadRemoteMiddlewares,
	writeMiddleware,
} from "./middleware";

export const updateRedirectMiddleware = async (
	application: ApplicationNested,
	data: Redirect,
) => {
	const { appName, serverId } = application;
	let config: FileConfig;

	if (serverId) {
		config = await loadRemoteMiddlewares(serverId);
	} else {
		config = loadMiddlewares<FileConfig>();
	}
	const middlewareName = `redirect-${appName}-${data.uniqueConfigKey}`;

	if (config?.http?.middlewares?.[middlewareName]) {
		config.http.middlewares[middlewareName] = {
			redirectRegex: {
				regex: data.regex,
				replacement: data.replacement,
				permanent: data.permanent,
			},
		};
	}

	if (serverId) {
		await writeTraefikConfigRemote(config, "middlewares", serverId);
	} else {
		writeMiddleware(config);
	}
};
export const createRedirectMiddleware = async (
	application: ApplicationNested,
	data: Redirect,
) => {
	const { appName, serverId } = application;

	let config: FileConfig;

	if (serverId) {
		config = await loadRemoteMiddlewares(serverId);
	} else {
		config = loadMiddlewares<FileConfig>();
	}

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

	let appConfig: FileConfig;

	if (serverId) {
		appConfig = await loadOrCreateConfigRemote(serverId, appName);
	} else {
		appConfig = loadOrCreateConfig(appName);
	}

	addMiddleware(appConfig, middlewareName);

	if (serverId) {
		await writeTraefikConfigRemote(config, "middlewares", serverId);
		await writeTraefikConfigRemote(appConfig, appName, serverId);
	} else {
		writeMiddleware(config);
		writeTraefikConfig(appConfig, appName);
	}
};

export const removeRedirectMiddleware = async (
	application: ApplicationNested,
	data: Redirect,
) => {
	const { appName, serverId } = application;
	let config: FileConfig;

	if (serverId) {
		config = await loadRemoteMiddlewares(serverId);
	} else {
		config = loadMiddlewares<FileConfig>();
	}
	const middlewareName = `redirect-${appName}-${data.uniqueConfigKey}`;

	if (config?.http?.middlewares?.[middlewareName]) {
		delete config.http.middlewares[middlewareName];
	}
	let appConfig: FileConfig;
	if (serverId) {
		appConfig = await loadOrCreateConfigRemote(serverId, appName);
	} else {
		appConfig = loadOrCreateConfig(appName);
	}

	deleteMiddleware(appConfig, middlewareName);

	if (serverId) {
		await writeTraefikConfigRemote(config, "middlewares", serverId);
		await writeTraefikConfigRemote(appConfig, appName, serverId);
	} else {
		writeTraefikConfig(appConfig, appName);
		writeMiddleware(config);
	}
};
