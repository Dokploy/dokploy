import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { TRPCError } from "@trpc/server";
import { execAsyncRemote } from "../utils/process/execAsync";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";
import { findMariadbById } from "./mariadb";
import { findMongoById } from "./mongo";
import { findMySqlById } from "./mysql";
import { findPostgresById } from "./postgres";
import { findRedisById } from "./redis";

export type FileManagerServiceType =
	| "application"
	| "postgres"
	| "mysql"
	| "mariadb"
	| "mongo"
	| "redis"
	| "compose";

export type FileManagerEntryType = "file" | "directory";

export interface FileManagerEntry {
	name: string;
	path: string;
	type: FileManagerEntryType;
	size: number;
	extension?: string;
	modifiedAt: string;
	createdAt?: string;
}

export interface FileManagerContext {
	basePath: string;
	serverId?: string | null;
	organizationId: string;
	appName: string;
	serviceType: FileManagerServiceType;
}

export const FILE_MANAGER_LIMITS = {
	maxReadBytes: 2 * 1024 * 1024,
	maxWriteBytes: 2 * 1024 * 1024,
	maxListEntries: 2000,
	maxSearchResults: 500,
	maxSearchDepth: 8,
} as const;

const getPathLib = (serverId?: string | null) =>
	serverId ? path.posix : path;

const toPosix = (value: string) => value.replaceAll("\\", "/");

const shQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

const normalizeRelativePath = (input?: string) => {
	const raw = toPosix(input || "").replace(/^\/+/, "");
	const parts = raw.split("/").filter(Boolean);
	if (parts.some((part) => part === "..")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid path",
		});
	}
	return parts.join("/");
};

const resolveSafePath = (
	basePath: string,
	relativePath: string | undefined,
	serverId?: string | null,
) => {
	const pathLib = getPathLib(serverId);
	const safeRelative = normalizeRelativePath(relativePath);
	const absolutePath = pathLib.resolve(basePath, safeRelative);
	const relative = pathLib.relative(basePath, absolutePath);
	const relativePosix = toPosix(relative);
	const segments = relativePosix.split("/").filter(Boolean);
	if (segments.some((seg) => seg === "..")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path escapes file manager root",
		});
	}
	return {
		absolutePath,
		relative: relativePosix || "",
	};
};

const ensureBaseDirectory = async (
	basePath: string,
	serverId?: string | null,
) => {
	if (serverId) {
		await execAsyncRemote(serverId, `mkdir -p ${shQuote(basePath)}`);
		return;
	}
	await fs.promises.mkdir(basePath, { recursive: true });
};

const detectBinary = (buffer: Buffer) => {
	if (buffer.length === 0) return false;
	let nonPrintable = 0;
	for (const byte of buffer) {
		if (byte === 0) return true;
		if (byte < 9 || (byte > 13 && byte < 32) || byte > 126) {
			nonPrintable += 1;
		}
	}
	return nonPrintable / buffer.length > 0.3;
};

const formatEntry = (
	absolutePath: string,
	basePath: string,
	type: FileManagerEntryType,
	stats: { size: number; mtime: Date; birthtime?: Date },
	serverId?: string | null,
): FileManagerEntry => {
	const pathLib = getPathLib(serverId);
	const relativePath = toPosix(pathLib.relative(basePath, absolutePath));
	const name = pathLib.basename(absolutePath);
	return {
		name,
		path: relativePath,
		type,
		size: type === "directory" ? 0 : stats.size,
		extension: type === "file" ? path.extname(name).slice(1) : undefined,
		modifiedAt: stats.mtime.toISOString(),
		createdAt: stats.birthtime ? stats.birthtime.toISOString() : undefined,
	};
};

export const resolveFileManagerContext = async (
	serviceType: FileManagerServiceType,
	serviceId: string,
): Promise<FileManagerContext> => {
	let appName = "";
	let serverId: string | null | undefined = null;
	let organizationId = "";

	if (serviceType === "application") {
		const app = await findApplicationById(serviceId);
		appName = app.appName;
		serverId = app.serverId;
		organizationId = app.environment.project.organizationId;
	} else if (serviceType === "postgres") {
		const postgres = await findPostgresById(serviceId);
		appName = postgres.appName;
		serverId = postgres.serverId;
		organizationId = postgres.environment.project.organizationId;
	} else if (serviceType === "mysql") {
		const mysql = await findMySqlById(serviceId);
		appName = mysql.appName;
		serverId = mysql.serverId;
		organizationId = mysql.environment.project.organizationId;
	} else if (serviceType === "mariadb") {
		const mariadb = await findMariadbById(serviceId);
		appName = mariadb.appName;
		serverId = mariadb.serverId;
		organizationId = mariadb.environment.project.organizationId;
	} else if (serviceType === "mongo") {
		const mongo = await findMongoById(serviceId);
		appName = mongo.appName;
		serverId = mongo.serverId;
		organizationId = mongo.environment.project.organizationId;
	} else if (serviceType === "redis") {
		const redis = await findRedisById(serviceId);
		appName = redis.appName;
		serverId = redis.serverId;
		organizationId = redis.environment.project.organizationId;
	} else if (serviceType === "compose") {
		const compose = await findComposeById(serviceId);
		appName = compose.appName;
		serverId = compose.serverId;
		organizationId = compose.environment.project.organizationId;
	}

	const basePaths = paths(!!serverId);
	const rootPath =
		serviceType === "compose"
			? basePaths.COMPOSE_PATH
			: basePaths.APPLICATIONS_PATH;
	const pathLib = getPathLib(serverId);
	const basePath = pathLib.join(rootPath, appName, "files");

	await ensureBaseDirectory(basePath, serverId);

	return {
		basePath,
		serverId,
		organizationId,
		appName,
		serviceType,
	};
};

export const listFileManagerEntries = async ({
	context,
	path: relativePath,
	includeHidden = false,
	limit = FILE_MANAGER_LIMITS.maxListEntries,
}: {
	context: FileManagerContext;
	path?: string;
	includeHidden?: boolean;
	limit?: number;
}) => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);
	const entries: FileManagerEntry[] = [];

	if (serverId) {
		const command = `
TARGET=${shQuote(absolutePath)}
if [ ! -d "$TARGET" ]; then
	echo "__MISSING__"
	exit 0
fi
find "$TARGET" -mindepth 1 -maxdepth 1 -printf '%y\t%s\t%T@\t%p\\0'
`;
		const { stdout } = await execAsyncRemote(serverId, command);
		if (stdout.trim() === "__MISSING__") {
			return [];
		}
		const records = stdout.split("\0").filter(Boolean);
		for (const record of records) {
			if (entries.length >= limit) break;
			const [typeFlag, sizeRaw, mtimeRaw, fullPath = ""] = record.split(
				"\t",
			);
			if (!fullPath) continue;
			const name = path.posix.basename(fullPath);
			if (!includeHidden && name.startsWith(".")) continue;
			if (typeFlag === "l") continue;
			const type = typeFlag === "d" ? "directory" : "file";
			const size = Number.parseInt(sizeRaw || "0", 10) || 0;
			const modifiedAt = new Date(Number.parseFloat(mtimeRaw || "0") * 1000);
			const absolute = fullPath;
			entries.push(
				formatEntry(
					absolute,
					basePath,
					type,
					{ size, mtime: modifiedAt },
					serverId,
				),
			);
		}
	} else {
		const items = await fs.promises.readdir(absolutePath, {
			withFileTypes: true,
		});
		for (const item of items) {
			if (entries.length >= limit) break;
			if (!includeHidden && item.name.startsWith(".")) continue;
			if (item.isSymbolicLink()) continue;
			const fullPath = path.join(absolutePath, item.name);
			const stats = await fs.promises.stat(fullPath);
			const type = item.isDirectory() ? "directory" : "file";
			entries.push(
				formatEntry(
					fullPath,
					basePath,
					type,
					{
						size: stats.size,
						mtime: stats.mtime,
						birthtime: stats.birthtime,
					},
					serverId,
				),
			);
		}
	}

	entries.sort((a, b) => {
		if (a.type !== b.type) {
			return a.type === "directory" ? -1 : 1;
		}
		return a.name.localeCompare(b.name, undefined, {
			numeric: true,
			sensitivity: "base",
		});
	});

	return entries;
};

export const statFileManagerEntry = async ({
	context,
	path: relativePath,
}: {
	context: FileManagerContext;
	path: string;
}): Promise<FileManagerEntry> => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);

	if (serverId) {
		const command = `stat -c '%F|%s|%Y' ${shQuote(absolutePath)}`;
		const { stdout } = await execAsyncRemote(serverId, command);
		const [typeRaw, sizeRaw, mtimeRaw] = stdout.trim().split("|");
		const type =
			typeRaw?.includes("directory") === true ? "directory" : "file";
		const size = Number.parseInt(sizeRaw || "0", 10) || 0;
		const modifiedAt = new Date(Number.parseInt(mtimeRaw || "0", 10) * 1000);
		return formatEntry(
			absolutePath,
			basePath,
			type,
			{ size, mtime: modifiedAt },
			serverId,
		);
	}

	const stats = await fs.promises.stat(absolutePath);
	const type = stats.isDirectory() ? "directory" : "file";
	return formatEntry(
		absolutePath,
		basePath,
		type,
		{ size: stats.size, mtime: stats.mtime, birthtime: stats.birthtime },
		serverId,
	);
};

export const readFileManagerFile = async ({
	context,
	path: relativePath,
	encoding = "utf8",
}: {
	context: FileManagerContext;
	path: string;
	encoding?: "utf8" | "base64";
}) => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);
	const entry = await statFileManagerEntry({ context, path: relativePath });

	if (entry.type !== "file") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path is not a file",
		});
	}

	if (entry.size > FILE_MANAGER_LIMITS.maxReadBytes) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: "File exceeds read size limit",
		});
	}

	if (serverId) {
		const command = `base64 ${shQuote(absolutePath)} | tr -d '\\n'`;
		const { stdout } = await execAsyncRemote(serverId, command);
		const buffer = Buffer.from(stdout.trim(), "base64");
		const isBinary = detectBinary(buffer);
		const content =
			encoding === "base64" || isBinary
				? stdout.trim()
				: buffer.toString("utf8");
		return {
			...entry,
			content,
			encoding: isBinary ? "base64" : encoding,
			isBinary,
		};
	}

	const buffer = await fs.promises.readFile(absolutePath);
	const isBinary = detectBinary(buffer);
	const content =
		encoding === "base64" || isBinary
			? buffer.toString("base64")
			: buffer.toString("utf8");
	return {
		...entry,
		content,
		encoding: isBinary ? "base64" : encoding,
		isBinary,
	};
};

export const writeFileManagerFile = async ({
	context,
	path: relativePath,
	content,
	encoding = "utf8",
	overwrite = false,
}: {
	context: FileManagerContext;
	path: string;
	content: string;
	encoding?: "utf8" | "base64";
	overwrite?: boolean;
}) => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);
	const pathLib = getPathLib(serverId);
	const directory = pathLib.dirname(absolutePath);
	const buffer =
		encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content);

	if (buffer.length > FILE_MANAGER_LIMITS.maxWriteBytes) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: "File exceeds write size limit",
		});
	}

	if (serverId) {
		if (!overwrite) {
			const existsCheck = `if [ -e ${shQuote(
				absolutePath,
			)} ]; then echo "__EXISTS__"; fi`;
			const { stdout } = await execAsyncRemote(serverId, existsCheck);
			if (stdout.trim() === "__EXISTS__") {
				throw new TRPCError({
					code: "CONFLICT",
					message: "File already exists",
				});
			}
		}
		const encoded = buffer.toString("base64");
		const command = `
mkdir -p ${shQuote(directory)}
printf %s ${shQuote(encoded)} | base64 -d > ${shQuote(absolutePath)}
`;
		await execAsyncRemote(serverId, command);
		return statFileManagerEntry({ context, path: relativePath });
	}

	await fs.promises.mkdir(directory, { recursive: true });
	if (!overwrite && fs.existsSync(absolutePath)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "File already exists",
		});
	}
	await fs.promises.writeFile(absolutePath, buffer);
	return statFileManagerEntry({ context, path: relativePath });
};

export const createFileManagerDirectory = async ({
	context,
	path: relativePath,
}: {
	context: FileManagerContext;
	path: string;
}) => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);
	if (serverId) {
		await execAsyncRemote(serverId, `mkdir -p ${shQuote(absolutePath)}`);
		return statFileManagerEntry({ context, path: relativePath });
	}
	await fs.promises.mkdir(absolutePath, { recursive: true });
	return statFileManagerEntry({ context, path: relativePath });
};

export const deleteFileManagerEntry = async ({
	context,
	path: relativePath,
	recursive = false,
}: {
	context: FileManagerContext;
	path: string;
	recursive?: boolean;
}) => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);
	const entry = await statFileManagerEntry({ context, path: relativePath });

	if (serverId) {
		if (entry.type === "directory") {
			const command = recursive
				? `rm -rf ${shQuote(absolutePath)}`
				: `rmdir ${shQuote(absolutePath)}`;
			await execAsyncRemote(serverId, command);
		} else {
			await execAsyncRemote(serverId, `rm -f ${shQuote(absolutePath)}`);
		}
		return true;
	}

	if (entry.type === "directory") {
		if (recursive) {
			await fs.promises.rm(absolutePath, { recursive: true, force: true });
		} else {
			await fs.promises.rmdir(absolutePath);
		}
	} else {
		await fs.promises.unlink(absolutePath);
	}
	return true;
};

export const moveFileManagerEntry = async ({
	context,
	from,
	to,
}: {
	context: FileManagerContext;
	from: string;
	to: string;
}) => {
	const { basePath, serverId } = context;
	const fromPath = resolveSafePath(basePath, from, serverId).absolutePath;
	const toPath = resolveSafePath(basePath, to, serverId).absolutePath;
	const pathLib = getPathLib(serverId);
	const directory = pathLib.dirname(toPath);

	if (serverId) {
		const command = `
mkdir -p ${shQuote(directory)}
mv ${shQuote(fromPath)} ${shQuote(toPath)}
`;
		await execAsyncRemote(serverId, command);
		return statFileManagerEntry({ context, path: to });
	}

	await fs.promises.mkdir(directory, { recursive: true });
	await fs.promises.rename(fromPath, toPath);
	return statFileManagerEntry({ context, path: to });
};

export const copyFileManagerEntry = async ({
	context,
	from,
	to,
}: {
	context: FileManagerContext;
	from: string;
	to: string;
}) => {
	const { basePath, serverId } = context;
	const fromPath = resolveSafePath(basePath, from, serverId).absolutePath;
	const toPath = resolveSafePath(basePath, to, serverId).absolutePath;
	const pathLib = getPathLib(serverId);
	const directory = pathLib.dirname(toPath);

	if (serverId) {
		const command = `
mkdir -p ${shQuote(directory)}
cp -a ${shQuote(fromPath)} ${shQuote(toPath)}
`;
		await execAsyncRemote(serverId, command);
		return statFileManagerEntry({ context, path: to });
	}

	await fs.promises.mkdir(directory, { recursive: true });
	await fs.promises.cp(fromPath, toPath, { recursive: true });
	return statFileManagerEntry({ context, path: to });
};

export const searchFileManagerEntries = async ({
	context,
	query,
	path: relativePath,
	includeHidden = false,
	limit = FILE_MANAGER_LIMITS.maxSearchResults,
	maxDepth = FILE_MANAGER_LIMITS.maxSearchDepth,
}: {
	context: FileManagerContext;
	query: string;
	path?: string;
	includeHidden?: boolean;
	limit?: number;
	maxDepth?: number;
}) => {
	const { basePath, serverId } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath, serverId);
	const sanitizedQuery = query.trim();
	if (!sanitizedQuery) return [];

	const results: FileManagerEntry[] = [];
	const depthLimit = Math.max(
		1,
		Math.min(maxDepth, FILE_MANAGER_LIMITS.maxSearchDepth),
	);

	if (serverId) {
		const pattern = `*${sanitizedQuery.replace(/'/g, "")}*`;
		const command = `
TARGET=${shQuote(absolutePath)}
if [ ! -d "$TARGET" ]; then
	exit 0
fi
find "$TARGET" -maxdepth ${Math.max(
	1,
	Math.min(maxDepth, FILE_MANAGER_LIMITS.maxSearchDepth),
)} -iname ${shQuote(pattern)} -printf '%y\t%s\t%T@\t%p\\0'
`;
		const { stdout } = await execAsyncRemote(serverId, command);
		const records = stdout.split("\0").filter(Boolean);
		for (const record of records) {
			if (results.length >= limit) break;
			const [typeFlag, sizeRaw, mtimeRaw, fullPath = ""] = record.split(
				"\t",
			);
			if (!fullPath) continue;
			const name = path.posix.basename(fullPath);
			if (!includeHidden && name.startsWith(".")) continue;
			if (typeFlag === "l") continue;
			const type = typeFlag === "d" ? "directory" : "file";
			const size = Number.parseInt(sizeRaw || "0", 10) || 0;
			const modifiedAt = new Date(Number.parseFloat(mtimeRaw || "0") * 1000);
			results.push(
				formatEntry(
					fullPath,
					basePath,
					type,
					{ size, mtime: modifiedAt },
					serverId,
				),
			);
		}
		return results;
	}

	const stack: { dir: string; depth: number }[] = [
		{ dir: absolutePath, depth: 0 },
	];

	while (stack.length > 0 && results.length < limit) {
		const current = stack.pop();
		if (!current) break;
		const items = await fs.promises.readdir(current.dir, {
			withFileTypes: true,
		});
		for (const item of items) {
			if (results.length >= limit) break;
			if (!includeHidden && item.name.startsWith(".")) continue;
			if (item.isSymbolicLink()) continue;
			const fullPath = path.join(current.dir, item.name);
			const stats = await fs.promises.stat(fullPath);
			const type = item.isDirectory() ? "directory" : "file";
			if (item.name.toLowerCase().includes(sanitizedQuery.toLowerCase())) {
				results.push(
					formatEntry(
						fullPath,
						basePath,
						type,
						{
							size: stats.size,
							mtime: stats.mtime,
							birthtime: stats.birthtime,
						},
						serverId,
					),
				);
			}
			if (item.isDirectory() && current.depth < depthLimit) {
				stack.push({ dir: fullPath, depth: current.depth + 1 });
			}
		}
	}

	return results;
};
