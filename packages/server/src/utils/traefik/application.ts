import fs, { writeFileSync } from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Domain } from "@dokploy/server/services/domain";
import { quote } from "shell-quote";
import { parse, stringify } from "yaml";
import {
	DATE_RANGE_ENTRY_LIMIT,
	DEFAULT_ENTRY_LIMIT,
	readLastLogEntries,
} from "../access-log/reader";
import { encodeBase64 } from "../docker/utils";
import { execAsync, execAsyncRemote } from "../process/execAsync";
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

export const readMonitoringConfig = async (
	readAll = false,
	dateRange?: { start?: string; end?: string },
) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, "access.log");
	if (!fs.existsSync(configPath)) {
		return null;
	}

	// access.log is append-only, so the entries the UI cares about are always at the
	// end of the file. Reading backwards keeps memory bounded by what is returned
	// instead of by the size of the log, and never blocks the event loop.
	//
	// When a start date is given the walk stops there; the limit is then only a safety
	// ceiling so that a very wide range still cannot pull an unbounded number of
	// entries into memory.
	return readLastLogEntries(configPath, {
		limit: readAll ? DATE_RANGE_ENTRY_LIMIT : DEFAULT_ENTRY_LIMIT,
		notBefore: dateRange?.start ? new Date(dateRange.start) : undefined,
	});
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
		const encoded = encodeBase64(traefikConfig);
		await execAsyncRemote(
			serverId,
			`echo "${encoded}" | base64 -d > ${quote([configPath])}`,
		);
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
				`echo "${encoded}" | base64 -d > ${quote([configPath])}`,
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
		const encoded = encodeBase64(yamlStr);
		await execAsyncRemote(
			serverId,
			`echo "${encoded}" | base64 -d > ${quote([configPath])}`,
		);
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
