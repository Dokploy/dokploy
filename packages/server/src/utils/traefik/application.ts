import fs, { writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Domain } from "@dokploy/server/services/domain";
import { quote } from "shell-quote";
import { parse, stringify } from "yaml";
import {
	execAsync,
	execAsyncRemote,
	writeFileRemote,
} from "../process/execAsync";
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
	const yamlStr = stringify(config);
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
		const command = `rm -f ${quote([configPath])}`;

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} catch (error) {
		console.error(`Error removing traefik config for ${appName}:`, error);
	}
};

export const removeTraefikConfigRemote = async (
	appName: string,
	serverId: string,
) => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths(true);
		const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
		await execAsyncRemote(serverId, `rm -f ${quote([configPath])}`);
	} catch (error) {
		console.error(
			`Error removing remote traefik config for ${appName}:`,
			error,
		);
	}
};

const configLocks = new Map<string, Promise<unknown>>();

export const withTraefikConfigLock = async <T>(
	appName: string,
	serverId: string | null | undefined,
	fn: () => Promise<T>,
): Promise<T> => {
	const key = `${serverId ?? "local"}:${appName}`;
	const previous = configLocks.get(key) ?? Promise.resolve();
	const current = previous.catch(() => {}).then(fn);
	configLocks.set(key, current);
	try {
		return await current;
	} finally {
		if (configLocks.get(key) === current) {
			configLocks.delete(key);
		}
	}
};

export const loadOrCreateConfig = (appName: string): FileConfig => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`);
	if (fs.existsSync(configPath)) {
		const yamlStr = fs.readFileSync(configPath, "utf8");
		const parsedConfig = (parse(yamlStr) as FileConfig) || {
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
		const { stdout } = await execAsyncRemote(
			serverId,
			`cat ${quote([configPath])}`,
		);

		if (!stdout) return fileConfig;

		const parsedConfig = (parse(stdout) as FileConfig) || {
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
		const { stdout } = await execAsyncRemote(
			serverId,
			`cat ${quote([configPath])}`,
		);
		if (!stdout) return null;
		return stdout;
	} catch {
		return null;
	}
};

export const readMonitoringConfig = async (dateRange?: {
	start?: string;
	end?: string;
}) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, "access.log");
	if (!fs.existsSync(configPath)) {
		return null;
	}

	const limit =
		dateRange?.start || dateRange?.end ? Number.POSITIVE_INFINITY : 500;
	// Entries can be written slightly out of order; stop a minute past the start.
	const startSecond = dateRange?.start
		? Math.floor(new Date(dateRange.start).getTime() / 1000) * 1000
		: Number.NEGATIVE_INFINITY;
	const stopBefore = startSecond - 60_000;

	const lines: string[] = [];
	let reachedStart = false;
	const collect = (line: string) => {
		const trimmed = line.trim();
		if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
			return;
		}
		try {
			const log = JSON.parse(trimmed);
			const time = new Date(log.time).getTime();
			if (time < stopBefore) {
				reachedStart = true;
			} else if (
				time >= startSecond &&
				log.ServiceName !== "dokploy-service-app@file"
			) {
				lines.push(trimmed);
			}
		} catch {}
	};

	const file = await fs.promises.open(configPath, "r");
	try {
		let position = (await file.stat()).size;
		let carry = Buffer.alloc(0);
		while (position > 0 && lines.length < limit && !reachedStart) {
			const size = Math.min(64 * 1024, position);
			position -= size;
			const chunk = Buffer.alloc(size);
			await file.read(chunk, 0, size, position);
			// Split on bytes so a multi-byte character cut by the chunk edge stays intact.
			const buffer = Buffer.concat([chunk, carry]);
			let end = buffer.length;
			let newline = buffer.lastIndexOf(0x0a, end - 1);
			while (newline !== -1 && lines.length < limit && !reachedStart) {
				collect(buffer.toString("utf8", newline + 1, end));
				end = newline;
				newline = end > 0 ? buffer.lastIndexOf(0x0a, end - 1) : -1;
			}
			carry = buffer.subarray(0, end);
		}
		if (lines.length < limit && !reachedStart) {
			collect(carry.toString("utf8"));
		}
	} finally {
		await file.close();
	}
	return lines.reverse().join("\n");
};

export const readConfigInPath = async (pathFile: string, serverId?: string) => {
	const configPath = path.join(pathFile);

	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`cat ${quote([configPath])}`,
		);
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
		await writeFileRemote(serverId, configPath, traefikConfig);
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
			await writeFileRemote(serverId, configPath, traefikConfig);
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
		const yamlStr = stringify(traefikConfig);
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
		const yamlStr = stringify(traefikConfig);
		await writeFileRemote(serverId, configPath, yamlStr);
	} catch (e) {
		console.error("Error saving the YAML config file:", e);
	}
};

const isEmptyHttpRoutersAndServices = (traefikConfig: FileConfig) =>
	Object.keys(traefikConfig.http?.routers || {}).length === 0 &&
	Object.keys(traefikConfig.http?.services || {}).length === 0;

export const writeAppTraefikConfig = async (
	traefikConfig: FileConfig,
	appName: string,
	serverId?: string | null,
) => {
	if (isEmptyHttpRoutersAndServices(traefikConfig)) {
		await removeTraefikConfig(appName, serverId);
		return;
	}
	if (serverId) {
		await writeTraefikConfigRemote(traefikConfig, appName, serverId);
	} else {
		writeTraefikConfig(traefikConfig, appName);
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
