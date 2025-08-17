import fs, { createReadStream, writeFileSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";
import { paths } from "@dokploy/server/constants";
import type { Domain } from "@dokploy/server/services/domain";
import { dump, load } from "js-yaml";
import { encodeBase64 } from "../docker/utils";
import { execAsyncRemote } from "../process/execAsync";
import type { FileConfig, HttpLoadBalancerService } from "./file-types";

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
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	fs.mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
	writeFileSync(
		path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`),
		yamlStr,
		"utf8",
	);
};

export const removeTraefikConfig = async (
	appName: string,
	serverId?: string | null,
) => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths(!!serverId);
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);

		if (serverId) {
			await execAsyncRemote(serverId, `rm ${configPath}`);
		} else {
			if (fs.existsSync(configPath)) {
				await fs.promises.unlink(configPath);
			}
		}
		if (fs.existsSync(configPath)) {
			await fs.promises.unlink(configPath);
		}
	} catch {}
};

export const removeTraefikConfigRemote = async (
	appName: string,
	serverId: string,
) => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths(true);
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		await execAsyncRemote(serverId, `rm ${configPath}`);
	} catch {}
};

export const loadOrCreateConfig = (appName: string): FileConfig => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
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
	const { DYNAMIC_TRAEFIK_PATH } = paths(true);
	const fileConfig: FileConfig = { http: { routers: {}, services: {} } };
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	try {
		const { stdout } = await execAsyncRemote(serverId, `cat ${configPath}`);

		if (!stdout) return fileConfig;

		const parsedConfig = (load(stdout) as FileConfig) || {
			http: { routers: {}, services: {} },
		};
		return parsedConfig;
	} catch {
		return fileConfig;
	}
};

export const readConfig = (appName: string) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const readRemoteConfig = async (serverId: string, appName: string) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths(true);
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	try {
		const { stdout } = await execAsyncRemote(serverId, `cat ${configPath}`);
		if (!stdout) return null;
		return stdout;
	} catch {
		return null;
	}
};

export const readMonitoringConfig = async (readAll = false) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, "access.log");
	if (fs.existsSync(configPath)) {
		if (!readAll) {
			// Read first 500 lines using streams
			let content = "";
			let validCount = 0;

			const fileStream = createReadStream(configPath, { encoding: "utf8" });
			const readline = createInterface({
				input: fileStream,
				crlfDelay: Number.POSITIVE_INFINITY,
			});

			for await (const line of readline) {
				try {
					const trimmed = line.trim();
					if (
						trimmed !== "" &&
						trimmed.startsWith("{") &&
						trimmed.endsWith("}")
					) {
						const log = JSON.parse(trimmed);
						if (log.ServiceName !== "dokploy-service-app@file") {
							content += `${line}\n`;
							validCount++;
							if (validCount >= 500) {
								break;
							}
						}
					}
				} catch {
					// Ignore invalid JSON
				}
			}
			return content;
		}
		return fs.readFileSync(configPath, "utf8");
	}
	return null;
};

export const readConfigInPath = async (pathFile: string, serverId?: string) => {
	const configPath = path.join(pathFile);

	if (serverId) {
		const { stdout } = await execAsyncRemote(serverId, `cat ${configPath}`);
		if (!stdout) return null;
		return stdout;
	}
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const writeConfig = (appName: string, traefikConfig: string) => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths();
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
		const { DYNAMIC_TRAEFIK_PATH } = paths(true);
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		await execAsyncRemote(serverId, `echo '${traefikConfig}' > ${configPath}`);
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const writeTraefikConfigInPath = async (
	pathFile: string,
	traefikConfig: string,
	serverId?: string,
) => {
	try {
		const configPath = path.join(pathFile);
		if (serverId) {
			const encoded = encodeBase64(traefikConfig);
			await execAsyncRemote(
				serverId,
				`echo "${encoded}" | base64 -d > "${configPath}"`,
			);
		} else {
			fs.writeFileSync(configPath, traefikConfig, "utf8");
		}
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

export const writeTraefikConfig = (
	traefikConfig: FileConfig,
	appName: string,
) => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths();
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
		const { DYNAMIC_TRAEFIK_PATH } = paths(true);
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
