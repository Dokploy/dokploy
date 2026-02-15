import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

interface SSHServerConnection {
	ipAddress: string;
	port: number;
	username: string;
}

const SSH_BASE_OPTIONS =
	"-o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -o IdentitiesOnly=yes";

/**
 * Escape a value for safe interpolation in shell commands.
 */
export const shellEscape = (value: string): string => {
	return `'${value.replaceAll("'", `'\"'\"'`)}'`;
};

/**
 * Ensure a server private key exists.
 */
export const getServerPrivateKey = (
	privateKey: string | undefined,
	serverLabel: string,
): string => {
	if (!privateKey) {
		throw new Error(`${serverLabel} has no SSH private key configured`);
	}
	return privateKey;
};

/**
 * Create a temporary private key file and return its cleanup callback.
 */
export const createTemporaryPrivateKeyFile = async (
	privateKey: string,
	prefix = "dokploy-transfer-key-",
): Promise<{ keyPath: string; cleanup: () => Promise<void> }> => {
	const tempDir = await mkdtemp(path.join(os.tmpdir(), prefix));
	const keyPath = path.join(tempDir, "id_rsa");

	await writeFile(keyPath, privateKey, { mode: 0o600 });
	await chmod(keyPath, 0o600);

	return {
		keyPath,
		cleanup: async () => {
			await rm(tempDir, { recursive: true, force: true });
		},
	};
};

/**
 * Build a raw SSH command without a remote command payload.
 */
export const buildSshCommand = (
	server: SSHServerConnection,
	privateKeyPath: string,
): string => {
	return `ssh ${SSH_BASE_OPTIONS} -i ${shellEscape(privateKeyPath)} -p ${server.port} ${shellEscape(
		`${server.username}@${server.ipAddress}`,
	)}`;
};

/**
 * Build an SSH command that executes a remote shell command.
 */
export const buildSshExecCommand = (
	server: SSHServerConnection,
	privateKeyPath: string,
	remoteCommand: string,
): string => {
	return `${buildSshCommand(server, privateKeyPath)} ${shellEscape(remoteCommand)}`;
};

/**
 * Build the SSH transport string consumed by rsync -e.
 */
export const buildRsyncSshTransport = (
	port: number,
	privateKeyPath: string,
): string => {
	return `ssh ${SSH_BASE_OPTIONS} -i ${shellEscape(privateKeyPath)} -p ${port}`;
};
