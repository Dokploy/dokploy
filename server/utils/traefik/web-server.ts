import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Admin } from "@/server/api/services/admin";
import { MAIN_TRAEFIK_PATH } from "@/server/constants";
import { dump, load } from "js-yaml";
import { loadOrCreateConfig, writeTraefikConfig } from "./application";
import type { FileConfig } from "./file-types";
import type { MainTraefikConfig } from "./types";

export const updateServerTraefik = (
	admin: Admin | null,
	newHost: string | null,
) => {
	const appName = "dokploy";
	const config: FileConfig = loadOrCreateConfig(appName);

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};

	const currentRouterConfig = config.http.routers[`${appName}-router-app`];

	if (currentRouterConfig) {
		if (newHost) {
			currentRouterConfig.rule = `Host(\`${newHost}\`)`;
		}
		if (admin?.certificateType === "letsencrypt") {
			currentRouterConfig.tls = { certResolver: "letsencrypt" };
		} else if (admin?.certificateType === "none") {
			currentRouterConfig.tls = undefined;
		}
	}

	writeTraefikConfig(config, appName);
};

export const updateLetsEncryptEmail = (newEmail: string | null) => {
	try {
		if (!newEmail) return;
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
	const configPath = join(MAIN_TRAEFIK_PATH, "traefik.yml");
	if (existsSync(configPath)) {
		const yamlStr = readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const writeMainConfig = (traefikConfig: string) => {
	try {
		const configPath = join(MAIN_TRAEFIK_PATH, "traefik.yml");
		writeFileSync(configPath, traefikConfig, "utf8");
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};
