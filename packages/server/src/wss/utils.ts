import os from "node:os";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { publicIpv4, publicIpv6 } from "public-ip";

export const getShell = () => {
	switch (os.platform()) {
		case "win32":
			return "powershell.exe";
		case "darwin":
			return "zsh";
		default:
			return "bash";
	}
};

export const getPublicIpWithFallback = async () => {
	let ip: string | null = null;
	try {
		ip = await publicIpv4();
	} catch (error) {
		console.log(
			"Error obtaining public IPv4 address, falling back to IPv6",
			error instanceof Error ? error.message : String(error),
		);
		try {
			ip = await publicIpv6();
		} catch (error) {
			console.error(
				"Error obtaining public IPv6 address",
				error instanceof Error ? error.message : String(error),
			);
			ip = null;
		}
	}
	return ip;
};

export const readValidDirectory = (
	directory: string,
	serverId?: string | null,
) => {
	if (!/^[\w/. :[\]-]{1,500}$/.test(directory)) {
		return false;
	}

	const { BASE_PATH } = paths(!!serverId);

	const resolvedBase = path.resolve(BASE_PATH);
	const resolvedDir = path.resolve(directory);

	return (
		resolvedDir === resolvedBase ||
		resolvedDir.startsWith(resolvedBase + path.sep)
	);
};

export type DeploymentLogPathRoot = "logs" | "schedules" | "volumeBackups";

export const readValidDeploymentLogPath = (
	logPath: string,
	serverId?: string | null,
	root: DeploymentLogPathRoot = "logs",
) => {
	if (!/^[\w/. :[\]-]{1,500}$/.test(logPath)) {
		return false;
	}

	const { LOGS_PATH, SCHEDULES_PATH, VOLUME_BACKUPS_PATH } = paths(!!serverId);
	const allowedRoot =
		root === "schedules"
			? SCHEDULES_PATH
			: root === "volumeBackups"
				? VOLUME_BACKUPS_PATH
				: LOGS_PATH;

	const resolvedLogs = path.resolve(allowedRoot);
	const resolvedLogPath = path.resolve(logPath);

	return (
		resolvedLogPath !== resolvedLogs &&
		resolvedLogPath.startsWith(resolvedLogs + path.sep) &&
		path.extname(resolvedLogPath) === ".log"
	);
};
