import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { User } from "@dokploy/server/services/user";
import { dump, load } from "js-yaml";
import {
	loadOrCreateConfig,
	removeTraefikConfig,
	writeTraefikConfig,
} from "./application";
import type { FileConfig } from "./file-types";
import type { MainTraefikConfig } from "./types";

export const updateServerTraefik = (
	user: User | null,
	newHost: string | null,
) => {
	const { https, certificateType } = user || {};
	const appName = "dokploy";
	const config: FileConfig = loadOrCreateConfig(appName);

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};
	config.http.services = config.http.services || {};

	const currentRouterConfig = config.http.routers[`${appName}-router-app`] || {
		rule: `Host(\`${newHost}\`)`,
		service: `${appName}-service-app`,
		entryPoints: ["web"],
	};
	config.http.routers[`${appName}-router-app`] = currentRouterConfig;

	config.http.services = {
		...config.http.services,
		[`${appName}-service-app`]: {
			loadBalancer: {
				servers: [
					{
						url: `http://dokploy:${process.env.PORT || 3000}`,
					},
				],
				passHostHeader: true,
			},
		},
	};

	if (https) {
		currentRouterConfig.middlewares = ["redirect-to-https"];

		if (certificateType === "letsencrypt") {
			config.http.routers[`${appName}-router-app-secure`] = {
				rule: `Host(\`${newHost}\`)`,
				service: `${appName}-service-app`,
				entryPoints: ["websecure"],
				tls: { certResolver: "letsencrypt" },
			};
		} else {
			config.http.routers[`${appName}-router-app-secure`] = {
				rule: `Host(\`${newHost}\`)`,
				service: `${appName}-service-app`,
				entryPoints: ["websecure"],
			};
		}
	} else {
		delete config.http.routers[`${appName}-router-app-secure`];
		currentRouterConfig.middlewares = [];
	}

	if (newHost) {
		writeTraefikConfig(config, appName);
	} else {
		removeTraefikConfig(appName);
	}
};

export const updateLetsEncryptEmail = (newEmail: string | null) => {
	try {
		if (!newEmail) return;
		const { MAIN_TRAEFIK_PATH } = paths();
		const configPath = join(MAIN_TRAEFIK_PATH, "traefik.yml");
		const configContent = readFileSync(configPath, "utf8");
		const config = load(configContent) as MainTraefikConfig;
		if (config?.certificatesResolvers?.letsencrypt?.acme) {
			config.certificatesResolvers.letsencrypt.acme.email = newEmail;
		} else {
			throw new Error("Invalid Let's Encrypt configuration structure.");
		}
		const newYamlContent = dump(config);
		writeFileSync(configPath, newYamlContent, "utf8");
	} catch (error) {
		throw error;
	}
};

export const readMainConfig = () => {
	const { MAIN_TRAEFIK_PATH } = paths();
	const configPath = join(MAIN_TRAEFIK_PATH, "traefik.yml");
	if (existsSync(configPath)) {
		const yamlStr = readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const writeMainConfig = (traefikConfig: string) => {
	try {
		const { MAIN_TRAEFIK_PATH } = paths();
		const configPath = join(MAIN_TRAEFIK_PATH, "traefik.yml");
		writeFileSync(configPath, traefikConfig, "utf8");
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};
