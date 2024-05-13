import { loadOrCreateConfig } from "./application";
import type { FileConfig, HttpRouter } from "./file-types";
import type { Registry } from "@/server/api/services/registry";
import { removeDirectoryIfExistsContent } from "../filesystem/directory";
import { REGISTRY_PATH } from "@/server/constants";
import { dump } from "js-yaml";
import { join } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

export const manageRegistry = async (registry: Registry) => {
	if (!existsSync(REGISTRY_PATH)) {
		mkdirSync(REGISTRY_PATH, { recursive: true });
	}
	const appName = "dokploy-registry";
	const config: FileConfig = loadOrCreateConfig(appName);
	const serviceName = `${appName}-service`;
	const routerName = `${appName}-router`;

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};
	config.http.services = config.http.services || {};

	config.http.routers[routerName] = await createRegistryRouterConfig(registry);

	config.http.services[serviceName] = {
		loadBalancer: {
			servers: [{ url: `http://${appName}:5000` }],
			passHostHeader: true,
		},
	};

	const yamlConfig = dump(config);
	const configFile = join(REGISTRY_PATH, "registry.yml");
	writeFileSync(configFile, yamlConfig);
};

export const removeSelfHostedRegistry = async () => {
	await removeDirectoryIfExistsContent(REGISTRY_PATH);
};

const createRegistryRouterConfig = async (registry: Registry) => {
	const { registryUrl } = registry;
	const url =
		process.env.NODE_ENV === "production"
			? registryUrl
			: "dokploy-registry.docker.localhost";
	const routerConfig: HttpRouter = {
		rule: `Host(\`${url}\`)`,
		service: "dokploy-registry-service",
		...(process.env.NODE_ENV === "production"
			? {
					middlewares: ["redirect-to-https"],
				}
			: {}),
		entryPoints: [
			"web",
			...(process.env.NODE_ENV === "production" ? ["websecure"] : []),
		],
		...(process.env.NODE_ENV === "production"
			? {
					tls: { certResolver: "letsencrypt" },
				}
			: {}),
	};

	return routerConfig;
};
