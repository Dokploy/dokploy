import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dump, load } from "js-yaml";
import { DYNAMIC_TRAEFIK_PATH } from "~/server/constants";
import type { ApplicationNested } from "../builders";
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

export const deleteAllMiddlewares = (application: ApplicationNested) => {
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

	writeMiddleware(config);
};

export const loadMiddlewares = <T>() => {
	const configPath = join(DYNAMIC_TRAEFIK_PATH, "middlewares.yml");
	if (!existsSync(configPath)) {
		throw new Error(`File not found: ${configPath}`);
	}
	const yamlStr = readFileSync(configPath, "utf8");
	const config = load(yamlStr) as T;
	return config;
};

export const writeMiddleware = <T>(config: T) => {
	const configPath = join(DYNAMIC_TRAEFIK_PATH, "middlewares.yml");
	const newYamlContent = dump(config);
	writeFileSync(configPath, newYamlContent, "utf8");
};
