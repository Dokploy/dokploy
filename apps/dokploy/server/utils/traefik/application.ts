import fs, { writeFileSync } from "node:fs";
import path from "node:path";
import type { Domain } from "@/server/api/services/domain";
import { DYNAMIC_TRAEFIK_PATH, MAIN_TRAEFIK_PATH } from "@/server/constants";
import { dump, load } from "js-yaml";
import type { FileConfig, HttpLoadBalancerService } from "./file-types";
import { findServerById } from "@/server/api/services/server";
import { Client } from "ssh2";
import { readSSHKey } from "../filesystem/ssh";

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
	const server = await findServerById(serverId);
	if (!server.sshKeyId) return { http: { routers: {}, services: {} } };

	const keys = await readSSHKey(server.sshKeyId);
	const client = new Client();
	let fileConfig: FileConfig;
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	return new Promise<FileConfig>((resolve, reject) => {
		client
			.on("ready", () => {
				client.exec(`cat ${configPath}`, (err, stream) => {
					if (err) {
						console.error("Execution error:", err);
						return { http: { routers: {}, services: {} } };
					}
					stream
						.on("close", (code, signal) => {
							client.end();
							if (code === 0) {
								if (!fileConfig) {
									fileConfig = { http: { routers: {}, services: {} } };
								}
								resolve(
									(load(fileConfig) as FileConfig) || {
										http: { routers: {}, services: {} },
									},
								);
							} else {
								console.log(fileConfig);

								resolve({ http: { routers: {}, services: {} } });

								// reject(new Error(`Command exited with code ${code}`));
							}
						})
						.on("data", (data: string) => {
							console.log(data.toString());
							fileConfig = data.toString() as unknown as FileConfig;
						})
						.stderr.on("data", (data) => {});
				});
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 99999,
			});
	});
};

export const readConfig = (appName: string) => {
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		return yamlStr;
	}
	return null;
};

export const readConfigInServer = async (serverId: string, appName: string) => {
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	let content = "";
	// if (fs.existsSync(configPath)) {
	// 	const yamlStr = fs.readFileSync(configPath, "utf8");
	// 	return yamlStr;
	// }

	const client = new Client();
	const server = await findServerById(serverId);
	if (!server.sshKeyId) return;
	const keys = await readSSHKey(server.sshKeyId);
	return new Promise<string>((resolve, reject) => {
		client
			.on("ready", () => {
				const bashCommand = `
					cat ${configPath}
				`;

				client.exec(bashCommand, (err, stream) => {
					if (err) {
						reject(err);
						return;
					}
					stream
						.on("close", () => {
							client.end();
							resolve(content);
						})
						.on("data", (data: string) => {
							content = data.toString();
						})
						.stderr.on("data", (data) => {
							reject(new Error(`stderr: ${data.toString()}`));
						});
				});
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: keys.privateKey,
				timeout: 99999,
			});
	});
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
		console.log(yamlStr);
		fs.writeFileSync(configPath, yamlStr, "utf8");
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
