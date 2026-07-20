import { paths } from "@dokploy/server/constants";
import type { WebServerProvider } from "./providers";

export const getWebServerPaths = (
	provider: WebServerProvider,
	isServer = false,
) => {
	const resolvedPaths = paths(isServer);

	if (provider === "caddy") {
		return {
			provider,
			basePath: resolvedPaths.MAIN_CADDY_PATH,
			activeConfigPath: resolvedPaths.CADDY_CONFIG_PATH,
			fragmentsPath: resolvedPaths.CADDY_FRAGMENTS_PATH,
			dataPath: resolvedPaths.CADDY_DATA_PATH,
			configDirPath: resolvedPaths.CADDY_CONFIG_DIR_PATH,
			migrationsPath: resolvedPaths.CADDY_MIGRATIONS_PATH,
		};
	}

	return {
		provider,
		basePath: resolvedPaths.MAIN_TRAEFIK_PATH,
		activeConfigPath: `${resolvedPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
		fragmentsPath: resolvedPaths.DYNAMIC_TRAEFIK_PATH,
		certificatesPath: resolvedPaths.CERTIFICATES_PATH,
	};
};
