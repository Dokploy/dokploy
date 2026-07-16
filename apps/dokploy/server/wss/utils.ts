import type { ChildProcess } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execAsync, IS_CLOUD, paths } from "@dokploy/server";

/**
 * Validates that the container ID matches Docker's expected format.
 * Docker container IDs are 64-character hex strings (or 12-char short form).
 * Also allows container names: alphanumeric, underscores, hyphens, and dots.
 */
export const isValidContainerId = (id: string): boolean => {
	// Match full ID (64 hex chars), short ID (12 hex chars), or container name
	const hexPattern = /^[a-f0-9]{12,64}$/i;
	const namePattern = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;
	return hexPattern.test(id) || (namePattern.test(id) && id.length <= 128);
};

/**
 * Validates the `tail` parameter for docker logs (number of lines, max 10000).
 * Prevents command injection by allowing only digits.
 */
export const isValidTail = (tail: string): boolean => {
	return (
		/^\d+$/.test(tail) &&
		Number.parseInt(tail, 10) <= 10000 &&
		Number.parseInt(tail, 10) >= 0
	);
};

/**
 * Validates the `since` parameter for docker logs: "all" or duration like 5s, 10m, 1h, 2d.
 * Prevents command injection by allowing only a strict format.
 */
export const isValidSince = (since: string): boolean => {
	return since === "all" || /^\d+[smhd]$/.test(since);
};

/**
 * Validates the `search` parameter for log filtering.
 * Only allow alphanumeric, space, dot, underscore, and hyphen.
 * Max length 500.
 */
export const isValidSearch = (search: string): boolean => {
	// Space only (not \s) to reject \n, \r, \t and other control chars
	return /^[a-zA-Z0-9 ._-]{0,500}$/.test(search);
};

interface DockerLogsArguments {
	containerId: string;
	runType: string | null;
	since: string;
	tail: string;
}

export const buildDockerLogsArguments = ({
	containerId,
	runType,
	since,
	tail,
}: DockerLogsArguments): string[] => {
	const args = [
		runType === "swarm" ? "service" : "container",
		"logs",
		"--timestamps",
	];

	if (runType === "swarm") {
		args.push("--raw");
	}

	args.push("--tail", tail);
	if (since !== "all") {
		args.push("--since", since);
	}
	args.push("--follow", containerId);

	return args;
};

export const createDockerLogsDataHandler = (
	search: string,
	onData: (data: string) => void,
) => {
	if (!search) {
		return {
			write: (data: Buffer | string) => onData(data.toString()),
			flush: () => {},
		};
	}

	const normalizedSearch = search.toLowerCase();
	let remainder = "";

	return {
		write: (data: Buffer | string) => {
			const lines = `${remainder}${data.toString()}`.split("\n");
			remainder = lines.pop() ?? "";
			const matches = lines.filter((line) =>
				line.toLowerCase().includes(normalizedSearch),
			);
			if (matches.length > 0) {
				onData(`${matches.join("\n")}\n`);
			}
		},
		flush: () => {
			if (remainder.toLowerCase().includes(normalizedSearch)) {
				onData(remainder);
			}
			remainder = "";
		},
	};
};

type KillableProcess = Pick<ChildProcess, "exitCode" | "kill" | "signalCode">;

export const terminateDockerLogsProcess = (
	childProcess: KillableProcess,
): NodeJS.Timeout | undefined => {
	if (childProcess.exitCode !== null || childProcess.signalCode !== null) {
		return;
	}

	childProcess.kill("SIGTERM");
	const forceKillTimeout = setTimeout(() => {
		if (childProcess.exitCode === null && childProcess.signalCode === null) {
			childProcess.kill("SIGKILL");
		}
	}, 1000);
	forceKillTimeout.unref();

	return forceKillTimeout;
};

/**
 * Validates that the shell is one of the allowed shells.
 */
export const isValidShell = (shell: string): boolean => {
	const allowedShells = [
		"sh",
		"bash",
		"zsh",
		"ash",
		"/bin/sh",
		"/bin/bash",
		"/bin/zsh",
		"/bin/ash",
	];
	return allowedShells.includes(shell);
};

export const getShell = () => {
	if (IS_CLOUD) {
		return "NO_AVAILABLE";
	}
	switch (os.platform()) {
		case "win32":
			return "powershell.exe";
		case "darwin":
			return "zsh";
		default:
			return "bash";
	}
};

/** Returns private SSH key for dokploy local server terminal. Uses already created SSH key or generates a new SSH key.
 */
export const setupLocalServerSSHKey = async () => {
	const { SSH_PATH } = paths(true);
	const sshKeyPath = path.join(SSH_PATH, "auto_generated-dokploy-local");

	if (!fs.existsSync(sshKeyPath)) {
		// Generate new SSH key if it hasn't been created yet
		await execAsync(
			`ssh-keygen -t rsa -b 4096 -f ${sshKeyPath} -N "" -C "dokploy-local-access"`,
		);
	}

	const privateKey = fs.readFileSync(sshKeyPath, "utf8");

	return privateKey;
};
