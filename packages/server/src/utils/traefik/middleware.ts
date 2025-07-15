import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Domain } from "@dokploy/server/services/domain";
import { dump, load } from "js-yaml";
import type { ApplicationNested } from "../builders";
import { execAsyncRemote } from "../process/execAsync";
import { writeTraefikConfigRemote } from "./application";
import type { FileConfig } from "./file-types";

export const addMiddleware = (config: FileConfig, middlewareName: string) => {
	if (config.http?.routers) {
		const values = Object.keys(config.http.routers);

		for (const routerName of values) {
			const router = config.http.routers[routerName];

			if (router) {
				if (!router.middlewares) {
					router.middlewares = [];
				}
				if (!router.middlewares.includes(middlewareName)) {
					router.middlewares.push(middlewareName);
				}
			}
		}
	}
};

export const deleteMiddleware = (
	config: FileConfig,
	middlewareName: string,
) => {
	if (config.http?.routers) {
		const values = Object.keys(config?.http?.routers);

		for (const routerName of values) {
			const router = config.http.routers[routerName];
			if (router?.middlewares) {
				router.middlewares = router.middlewares.filter(
					(m) => m !== middlewareName,
				);
			}
		}
	}
};

export const deleteAllMiddlewares = async (application: ApplicationNested) => {
	const config = loadMiddlewares<FileConfig>();
	const { security, appName, redirects } = application;

	if (config.http?.middlewares) {
		if (security.length > 0) {
			const middlewareName = `auth-${appName}`;

			delete config.http.middlewares[middlewareName];
		}

		for (const redirect of redirects) {
			const middlewareName = `redirect-${appName}-${redirect.uniqueConfigKey}`;
			delete config.http.middlewares[middlewareName];
		}
	}

	if (application.serverId) {
		await writeTraefikConfigRemote(config, "middlewares", application.serverId);
	} else {
		writeMiddleware(config);
	}
};

export const loadMiddlewares = <T>() => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = join(DYNAMIC_TRAEFIK_PATH, "middlewares.yml");
	if (!existsSync(configPath)) {
		throw new Error(`File not found: ${configPath}`);
	}
	const yamlStr = readFileSync(configPath, "utf8");
	const config = load(yamlStr) as T;
	return config;
};

export const loadRemoteMiddlewares = async (serverId: string) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths(true);
	const configPath = join(DYNAMIC_TRAEFIK_PATH, "middlewares.yml");

	try {
		const { stdout, stderr } = await execAsyncRemote(
			serverId,
			`cat ${configPath}`,
		);

		if (stderr) {
			console.error(`Error: ${stderr}`);
			throw new Error(`File not found: ${configPath}`);
		}
		const config = load(stdout) as FileConfig;
		return config;
	} catch (_) {
		throw new Error(`File not found: ${configPath}`);
	}
};
export const writeMiddleware = <T>(config: T) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = join(DYNAMIC_TRAEFIK_PATH, "middlewares.yml");
	const newYamlContent = dump(config);
	writeFileSync(configPath, newYamlContent, "utf8");
};

export const createPathMiddlewares = async (
	app: ApplicationNested,
	domain: Domain,
) => {
	let config: FileConfig;

	if (app.serverId) {
		try {
			config = await loadRemoteMiddlewares(app.serverId);
		} catch {
			config = { http: { middlewares: {} } };
		}
	} else {
		try {
			config = loadMiddlewares<FileConfig>();
		} catch {
			config = { http: { middlewares: {} } };
		}
	}

	const { appName } = app;
	const { uniqueConfigKey, internalPath, stripPath, path } = domain;

	if (!config.http) {
		config.http = { middlewares: {} };
	}
	if (!config.http.middlewares) {
		config.http.middlewares = {};
	}

	// Add internal path prefix middleware
	if (internalPath && internalPath !== "/" && internalPath !== path) {
		const middlewareName = `addprefix-${appName}-${uniqueConfigKey}`;
		config.http.middlewares[middlewareName] = {
			addPrefix: {
				prefix: internalPath,
			},
		};
	}

	// Strip external path middleware if needed
	if (stripPath && path && path !== "/") {
		const middlewareName = `stripprefix-${appName}-${uniqueConfigKey}`;
		config.http.middlewares[middlewareName] = {
			stripPrefix: {
				prefixes: [path],
			},
		};
	}

	if (app.serverId) {
		await writeTraefikConfigRemote(config, "middlewares", app.serverId);
	} else {
		writeMiddleware(config);
	}
};

export const removePathMiddlewares = async (
	app: ApplicationNested,
	uniqueConfigKey: number,
) => {
	let config: FileConfig;

	if (app.serverId) {
		try {
			config = await loadRemoteMiddlewares(app.serverId);
		} catch {
			return;
		}
	} else {
		try {
			config = loadMiddlewares<FileConfig>();
		} catch {
			return;
		}
	}

	const { appName } = app;

	if (config.http?.middlewares) {
		const addPrefixMiddleware = `addprefix-${appName}-${uniqueConfigKey}`;
		const stripPrefixMiddleware = `stripprefix-${appName}-${uniqueConfigKey}`;

		delete config.http.middlewares[addPrefixMiddleware];
		delete config.http.middlewares[stripPrefixMiddleware];
	}

	if (app.serverId) {
		await writeTraefikConfigRemote(config, "middlewares", app.serverId);
	} else {
		writeMiddleware(config);
	}
};
