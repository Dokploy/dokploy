import { randomUUID } from "node:crypto";
import {
	copyFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import * as path from "node:path";
import { paths } from "@dokploy/server/constants";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";
import { quote } from "shell-quote";
import type {
	CaddyMigrationArtifactPaths,
	CaddyMigrationReport,
} from "./types";

export const assertSafeMigrationId = (migrationId: string) => {
	if (
		!/^[a-zA-Z0-9_.-]+$/.test(migrationId) ||
		migrationId === "." ||
		migrationId === ".." ||
		migrationId.split(".").some((segment) => segment === "")
	) {
		throw new Error(
			`Invalid Caddy migration id "${migrationId}". Use letters, numbers, dash, underscore, or dot only; dot path segments are not allowed.`,
		);
	}
};

const assertPosixPathWithinBase = (basePath: string, targetPath: string) => {
	const resolvedBase = path.posix.resolve(basePath);
	const resolvedTarget = path.posix.resolve(targetPath);
	if (
		resolvedTarget !== resolvedBase &&
		!resolvedTarget.startsWith(`${resolvedBase}/`)
	) {
		throw new Error(`Resolved path "${targetPath}" escapes "${basePath}"`);
	}
};

export const createCaddyMigrationId = () =>
	`caddy-${new Date()
		.toISOString()
		.replace(/[^0-9]/g, "")
		.slice(0, 14)}-${randomUUID().slice(0, 8)}`;

export const getCaddyMigrationArtifactPaths = (
	migrationId: string,
	serverId?: string | null,
): CaddyMigrationArtifactPaths => {
	assertSafeMigrationId(migrationId);
	const migrationsPath = paths(!!serverId).CADDY_MIGRATIONS_PATH;
	const root = path.posix.join(migrationsPath, migrationId);
	assertPosixPathWithinBase(migrationsPath, root);
	return {
		root,
		reportJson: path.posix.join(root, "report.json"),
		reportMd: path.posix.join(root, "report.md"),
		caddyJson: path.posix.join(root, "caddy.json"),
		fragmentsDir: path.posix.join(root, "fragments"),
		backupsDir: path.posix.join(root, "backups"),
	};
};

const encodeBase64 = (content: string) =>
	Buffer.from(content, "utf8").toString("base64");

export const ensureMigrationDirectory = async (
	dirPath: string,
	serverId?: string | null,
) => {
	if (serverId) {
		await execAsyncRemote(serverId, `mkdir -p ${quote([dirPath])}`);
		return;
	}
	mkdirSync(dirPath, { recursive: true });
};

export const writeMigrationTextFile = async (
	filePath: string,
	content: string,
	serverId?: string | null,
) => {
	if (serverId) {
		const tempPath = `${filePath}.tmp-${Date.now()}`;
		await execAsyncRemote(
			serverId,
			[
				`mkdir -p ${quote([path.posix.dirname(filePath)])}`,
				`printf %s ${quote([encodeBase64(content)])} | base64 -d > ${quote([
					tempPath,
				])}`,
				`mv ${quote([tempPath])} ${quote([filePath])}`,
			].join(" && "),
		);
		return;
	}
	mkdirSync(path.dirname(filePath), { recursive: true });
	writeFileSync(filePath, content, "utf8");
};

export const readMigrationTextFileIfExists = async (
	filePath: string,
	serverId?: string | null,
) => {
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`if [ -f ${quote([filePath])} ]; then cat ${quote([filePath])}; fi`,
		);
		return stdout || null;
	}
	if (!existsSync(filePath)) return null;
	return readFileSync(filePath, "utf8");
};

export const readRequiredMigrationTextFile = async (
	filePath: string,
	serverId?: string | null,
) => {
	const content = await readMigrationTextFileIfExists(filePath, serverId);
	if (content === null) {
		throw new Error(`Migration file not found: ${filePath}`);
	}
	return content;
};

export const listMigrationFiles = async (
	dirPath: string,
	serverId?: string | null,
	extensions: string[] = [],
) => {
	if (serverId) {
		const extensionExpression = extensions.length
			? extensions.map((ext) => `-name '*${ext}'`).join(" -o ")
			: "-type f";
		const { stdout } = await execAsyncRemote(
			serverId,
			`if [ -d ${quote([dirPath])} ]; then find ${quote([
				dirPath,
			])} -maxdepth 1 -type f \\( ${extensionExpression} \\) | sort; fi`,
		);
		return stdout
			.split("\n")
			.map((item) => item.trim())
			.filter(Boolean);
	}
	if (!existsSync(dirPath)) return [];
	return readdirSync(dirPath)
		.filter((fileName) =>
			extensions.length
				? extensions.some((ext) => fileName.endsWith(ext))
				: true,
		)
		.sort()
		.map((fileName) => path.join(dirPath, fileName));
};

export const migrationPathExists = async (
	target: string,
	serverId?: string | null,
) => {
	if (serverId) {
		const { stdout } = await execAsyncRemote(
			serverId,
			`if [ -e ${quote([target])} ]; then echo yes; fi`,
		);
		return stdout.trim() === "yes";
	}
	return existsSync(target);
};

export const acquireCaddyMigrationOperationLock = async (
	migrationId: string,
	serverId?: string | null,
) => {
	const artifactPaths = getCaddyMigrationArtifactPaths(migrationId, serverId);
	const lockPath = path.posix.join(artifactPaths.root, ".operation.lock");
	const errorMessage = `Caddy migration ${migrationId} already has an apply or rollback operation in progress`;

	if (serverId) {
		try {
			await execAsyncRemote(
				serverId,
				`mkdir ${quote([lockPath])} 2>/dev/null || { echo ${quote([
					errorMessage,
				])} >&2; exit 70; }`,
			);
		} catch {
			throw new Error(errorMessage);
		}
	} else {
		try {
			mkdirSync(lockPath);
		} catch {
			throw new Error(errorMessage);
		}
	}

	let released = false;
	return async () => {
		if (released) return;
		released = true;
		await removeMigrationPath(lockPath, serverId);
	};
};

const copyLocalPath = (source: string, destination: string) => {
	const stats = statSync(source);
	if (stats.isDirectory()) {
		mkdirSync(destination, { recursive: true });
		for (const entry of readdirSync(source)) {
			copyLocalPath(path.join(source, entry), path.join(destination, entry));
		}
		return;
	}
	mkdirSync(path.dirname(destination), { recursive: true });
	writeFileSync(destination, readFileSync(source));
};

export const copyMigrationPath = async (
	source: string,
	destination: string,
	serverId?: string | null,
) => {
	const tempDestination = `${destination}.tmp-${Date.now()}`;
	if (serverId) {
		await execAsyncRemote(
			serverId,
			[
				`test -e ${quote([source])}`,
				`rm -rf ${quote([tempDestination])}`,
				`mkdir -p ${quote([path.posix.dirname(destination)])}`,
				`cp -a ${quote([source])} ${quote([tempDestination])}`,
				`rm -rf ${quote([destination])}`,
				`mv ${quote([tempDestination])} ${quote([destination])}`,
			].join(" && "),
		);
		return;
	}
	if (!existsSync(source)) {
		throw new Error(`Migration source path not found: ${source}`);
	}
	rmSync(tempDestination, { force: true, recursive: true });
	mkdirSync(path.dirname(destination), { recursive: true });
	copyLocalPath(source, tempDestination);
	rmSync(destination, { force: true, recursive: true });
	renameSync(tempDestination, destination);
};

export const copyMigrationFileInPlace = async (
	source: string,
	destination: string,
	serverId?: string | null,
) => {
	if (serverId) {
		const copyInPlaceCommand = [
			`test -f ${quote([source])}`,
			`test -f ${quote([destination])}`,
			`cp ${quote([source])} ${quote([destination])}`,
		].join(" && ");
		try {
			await execAsyncRemote(serverId, copyInPlaceCommand);
			return;
		} catch {
			await copyMigrationPath(source, destination, serverId);
			return;
		}
	}
	if (
		existsSync(source) &&
		statSync(source).isFile() &&
		existsSync(destination)
	) {
		const destinationStats = statSync(destination);
		if (destinationStats.isFile()) {
			copyFileSync(source, destination);
			return;
		}
	}
	await copyMigrationPath(source, destination, serverId);
};

export const removeMigrationPath = async (
	target: string,
	serverId?: string | null,
) => {
	if (serverId) {
		await execAsyncRemote(serverId, `rm -rf ${quote([target])}`);
		return;
	}
	rmSync(target, { force: true, recursive: true });
};

export const loadCaddyMigrationReport = async (
	migrationId: string,
	serverId?: string | null,
): Promise<CaddyMigrationReport> => {
	const artifactPaths = getCaddyMigrationArtifactPaths(migrationId, serverId);
	const content = await readRequiredMigrationTextFile(
		artifactPaths.reportJson,
		serverId,
	);
	return JSON.parse(content) as CaddyMigrationReport;
};

export const writeCaddyMigrationReport = async (
	report: CaddyMigrationReport,
	serverId?: string | null,
) => {
	const nextReport = {
		...report,
		updatedAt: new Date().toISOString(),
	};
	await writeMigrationTextFile(
		nextReport.artifactPaths.reportJson,
		`${JSON.stringify(nextReport, null, 2)}\n`,
		serverId,
	);
	return nextReport;
};

export const appendCaddyMigrationEvent = (
	report: CaddyMigrationReport,
	type: string,
	message: string,
): CaddyMigrationReport => ({
	...report,
	events: [...report.events, { at: new Date().toISOString(), type, message }],
});
