import fs, { writeFileSync } from "node:fs";
import path from "node:path";
import type { Domain } from "@/server/api/services/domain";
import { DYNAMIC_TRAEFIK_PATH } from "@/server/constants";
import { dump, load } from "js-yaml";
import type { FileConfig, HttpLoadBalancerService } from "./file-types";
import { execAsyncRemote } from "../process/execAsync";

export const createTraefikConfig = (appName: string) => {
	const defaultPort = 3000;
	const serviceURLDefault = `http://${appName}:${defaultPort}`;
	const domainDefault = `Host(\`${appName}.docker.localhost\`)`;
	const config: FileConfig = {
		http: {
			routers: {
				...(process.env.NODE_ENV === "production"
					? {}
					: {
							[`${appName}-router-1`]: {
								rule: domainDefault,
								service: `${appName}-service-1`,
								entryPoints: ["web"],
							},
						}),
			},

			services: {
				...(process.env.NODE_ENV === "production"
					? {}
					: {
							[`${appName}-service-1`]: {
								loadBalancer: {
									servers: [{ url: serviceURLDefault }],
									passHostHeader: true,
								},
							},
						}),
			},
		},
	};
	const yamlStr = dump(config);
	fs.mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
	writeFileSync(
		path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`),
		yamlStr,
		"utf8",
	);
};

export const removeTraefikConfig = async (appName: string) => {
	try {
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		if (fs.existsSync(configPath)) {
			await fs.promises.unlink(configPath);
		}
	} catch (error) {}
};

export const removeTraefikConfigRemote = async (
	appName: string,
	serverId: string,
) => {
	try {
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		await execAsyncRemote(serverId, `rm ${configPath}`);
	} catch (error) {}
};

export const loadOrCreateConfig = (appName: string): FileConfig => {
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		const parsedConfig = (load(yamlStr) as FileConfig) || {
			http: { routers: {}, services: {} },
		};
		return parsedConfig;
	}
	return { http: { routers: {}, services: {} } };
};

export const loadOrCreateConfigRemote = async (
	serverId: string,
	appName: string,
) => {
	const fileConfig: FileConfig = { http: { routers: {}, services: {} } };
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	try {
		const { stdout } = await execAsyncRemote(serverId, `cat ${configPath}`);

		if (!stdout) return fileConfig;

		const parsedConfig = (load(stdout) as FileConfig) || {
			http: { routers: {}, services: {} },
		};
		return parsedConfig;
	} catch (err) {
		return fileConfig;
	}
};

export const readConfig = (appName: string) => {
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const readRemoteConfig = async (serverId: string, appName: string) => {
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	try {
		const { stdout } = await execAsyncRemote(serverId, `cat ${configPath}`);
		if (!stdout) return null;
		return stdout;
	} catch (err) {
		return null;
	}
};

export const readMonitoringConfig = () => {
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, "access.log");
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const readConfigInPath = (pathFile: string) => {
	const configPath = path.join(pathFile);
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const writeConfig = (appName: string, traefikConfig: string) => {
	try {
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		fs.writeFileSync(configPath, traefikConfig, "utf8");
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const writeConfigRemote = async (
	serverId: string,
	appName: string,
	traefikConfig: string,
) => {
	try {
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		await execAsyncRemote(serverId, `echo '${traefikConfig}' > ${configPath}`);
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const writeTraefikConfigInPath = (
	pathFile: string,
	traefikConfig: string,
) => {
	try {
		const configPath = path.join(pathFile);
		fs.writeFileSync(configPath, traefikConfig, "utf8");
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const writeTraefikConfig = (
	traefikConfig: FileConfig,
	appName: string,
) => {
	try {
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		const yamlStr = dump(traefikConfig);
		fs.writeFileSync(configPath, yamlStr, "utf8");
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const writeTraefikConfigRemote = async (
	traefikConfig: FileConfig,
	appName: string,
	serverId: string,
) => {
	try {
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		const yamlStr = dump(traefikConfig);
		await execAsyncRemote(serverId, `echo '${yamlStr}' > ${configPath}`);
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const createServiceConfig = (
	appName: string,
	domain: Domain,
): {
	loadBalancer: HttpLoadBalancerService;
} => ({
	loadBalancer: {
		servers: [{ url: `http://${appName}:${domain.port || 80}` }],
		passHostHeader: true,
	},
});
