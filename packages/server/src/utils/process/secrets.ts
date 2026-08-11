import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { quote } from "shell-quote";

const shellSingleQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

export interface SecretTempFile {
	dir: string;
	path: string;
	quotedDir: string;
	quotedPath: string;
	mode: 0o600 | 0o700;
}

const pendingSecretFiles = new Map<string, SecretTempFile>();

export const createSecretTempFile = (
	prefix: string,
	fileName: string,
	content: string | null | undefined,
	mode: SecretTempFile["mode"] = 0o600,
) => {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	chmodSync(dir, 0o700);
	const path = join(dir, fileName);
	writeFileSync(path, content || "", { mode });

	const secret: SecretTempFile = {
		dir,
		path,
		quotedDir: quote([dir]),
		quotedPath: quote([path]),
		mode,
	};
	pendingSecretFiles.set(path, secret);
	const expiry = setTimeout(
		() => {
			if (pendingSecretFiles.delete(path)) {
				rmSync(dir, { recursive: true, force: true });
			}
		},
		10 * 60 * 1000,
	);
	expiry.unref();
	return secret;
};

export const createGitAskPassScript = (
	token: string | null | undefined,
	username = "oauth2",
) => {
	const quotedToken = shellSingleQuote(token || "");
	const quotedUsername = shellSingleQuote(username);
	return createSecretTempFile(
		"dokploy-git-askpass-",
		"askpass.sh",
		`#!/bin/sh
case "$1" in
	*Username*) printf '%s\\n' ${quotedUsername} ;;
	*) printf '%s\\n' ${quotedToken} ;;
esac
`,
		0o700,
	);
};

/**
 * Claims secret files referenced by a generated command. Claiming removes them
 * from the pending registry so concurrent commands cannot stage each other's
 * files.
 */
export const takeSecretTempFilesForCommand = (
	command: string,
): SecretTempFile[] => {
	const claimed: SecretTempFile[] = [];
	for (const [path, secret] of pendingSecretFiles) {
		if (command.includes(secret.quotedPath) || command.includes(path)) {
			pendingSecretFiles.delete(path);
			claimed.push(secret);
		}
	}
	return claimed;
};

export const cleanupSecretTempFiles = (files: readonly SecretTempFile[]) => {
	for (const file of files) {
		pendingSecretFiles.delete(file.path);
		rmSync(file.dir, { recursive: true, force: true });
	}
};

export interface RemoteSecretFile {
	localPath: string;
	remoteDir: string;
	remotePath: string;
	mode: SecretTempFile["mode"];
}

/** Rewrites controller-local temp paths to per-file paths on the SSH host. */
export const rewriteSecretTempFilesForRemote = (
	command: string,
	files: readonly SecretTempFile[],
	remoteRoot: string,
): { command: string; files: RemoteSecretFile[] } => {
	let rewritten = command;
	const remoteFiles = files.map((file, index) => {
		const remoteDir = `${remoteRoot}/${index}`;
		const remotePath = `${remoteDir}/${basename(file.path)}`;
		rewritten = rewritten
			.replaceAll(file.quotedPath, quote([remotePath]))
			.replaceAll(file.path, remotePath)
			.replaceAll(file.quotedDir, quote([remoteDir]))
			.replaceAll(file.dir, remoteDir);
		return {
			localPath: file.path,
			remoteDir,
			remotePath,
			mode: file.mode,
		};
	});

	return { command: rewritten, files: remoteFiles };
};
