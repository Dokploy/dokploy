import fs, { writeFileSync } from "node:fs";
import { open as openFile } from "node:fs/promises";
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

// A valid access.log entry is a JSON object, and not the Dokploy service's own
// requests (the dashboard polling itself would otherwise dominate the log).
const isValidRequestLine = (line: string) => {
	const trimmed = line.trim();
	if (trimmed === "" || !trimmed.startsWith("{") || !trimmed.endsWith("}")) {
		return false;
	}
	try {
		return JSON.parse(trimmed).ServiceName !== "dokploy-service-app@file";
	} catch {
		return false;
	}
};

// Reads the most recent `maxLines` valid entries without scanning the whole
// file: access.log only grows and the Requests view polls every few seconds,
// so a full forward read on every poll gets slower (and costs more CPU/IO) as
// the file grows between cleanups. Reading fixed-size chunks backward from
// EOF and stopping as soon as `maxLines` valid entries are found keeps each
// read's cost close to the tail window actually needed, not the file size.
const readRecentValidLines = async (filePath: string, maxLines: number) => {
	const CHUNK_SIZE = 64 * 1024;
	const fileHandle = await openFile(filePath, "r");
	try {
		const { size } = await fileHandle.stat();
		let position = size;
		// The start of a line whose end was already read in a later (closer to
		// EOF) chunk; carried leftward and prefixed onto the next chunk's text.
		let carry = "";
		const collected: string[] = []; // newest first

		while (position > 0 && collected.length < maxLines) {
			const readSize = Math.min(CHUNK_SIZE, position);
			position -= readSize;
			const buffer = Buffer.alloc(readSize);
			await fileHandle.read(buffer, 0, readSize, position);
			const chunkText = buffer.toString("utf8") + carry;
			const parts = chunkText.split("\n");

			// parts[0] is itself incomplete (its start is further left, still
			// unread) unless this chunk reaches all the way back to byte 0.
			carry = position > 0 ? (parts.shift() ?? "") : "";

			for (
				let i = parts.length - 1;
				i >= 0 && collected.length < maxLines;
				i--
			) {
				const part = parts[i] ?? "";
				const line = part.endsWith("\r") ? part.slice(0, -1) : part;
				if (line !== "" && isValidRequestLine(line)) {
					collected.push(line);
				}
			}
		}

		if (position === 0 && collected.length < maxLines && carry !== "") {
			const line = carry.endsWith("\r") ? carry.slice(0, -1) : carry;
			if (isValidRequestLine(line)) {
				collected.push(line);
			}
		}

		collected.reverse();
		return collected;
	} finally {
		await fileHandle.close();
	}
};

export const readMonitoringConfig = async (readAll = false) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configPath = path.join(DYNAMIC_TRAEFIK_PATH, "access.log");
	if (fs.existsSync(configPath)) {
		if (!readAll) {
			const lines = await readRecentValidLines(configPath, 500);
			return lines.map((line) => `${line}\n`).join("");
		}
		return fs.readFileSync(configPath, "utf8");
	}
	return null;
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
