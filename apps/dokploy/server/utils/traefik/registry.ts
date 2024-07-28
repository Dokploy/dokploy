import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Registry } from "@dokploy/server/api/services/registry";
import { REGISTRY_PATH } from "@dokploy/server/constants";
import { dump, load } from "js-yaml";
import { removeDirectoryIfExistsContent } from "../filesystem/directory";
import type { FileConfig, HttpRouter } from "./file-types";

export const manageRegistry = async (registry: Registry) => {
	if (!existsSync(REGISTRY_PATH)) {
		mkdirSync(REGISTRY_PATH, { recursive: true });
	}

	const appName = "dokploy-registry";
	const config: FileConfig = loadOrCreateConfig();

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
	const routerConfig: HttpRouter = {
		rule: `Host(\`${registryUrl}\`)`,
		service: "dokploy-registry-service",
		middlewares: ["redirect-to-https"],
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

const loadOrCreateConfig = (): FileConfig => {
	const configPath = join(REGISTRY_PATH, "registry.yml");
	if (existsSync(configPath)) {
		const yamlStr = readFileSync(configPath, "utf8");
		const parsedConfig = (load(yamlStr) as FileConfig) || {
			http: { routers: {}, services: {} },
		};
		return parsedConfig;
	}
	return { http: { routers: {}, services: {} } };
};
