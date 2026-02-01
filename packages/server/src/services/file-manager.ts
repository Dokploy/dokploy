import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { paths } from "@dokploy/server/constants";
import { TRPCError } from "@trpc/server";
import { normalizeFileMountPath } from "@dokploy/server/utils/docker/utils";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
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
export type FileManagerArchiveFormat =
	| "zip"
	| "tar"
	| "tar.gz"
	| "tgz"
	| "tar.bz2"
	| "tar.xz";
export type FileManagerExtractConflictPolicy = "fail" | "skip" | "overwrite";

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

export interface FileManagerExtractResult {
	archivePath: string;
	destinationPath: string;
	format: FileManagerArchiveFormat;
	extractedEntries: number;
	skippedEntries: number;
	totalEntries: number;
	totalBytes: number;
}

export const FILE_MANAGER_LIMITS = {
	maxReadBytes: 100 * 1024 * 1024,
	maxWriteBytes: 100 * 1024 * 1024,
	maxListEntries: 2000,
	maxSearchResults: 500,
	maxSearchDepth: 8,
	maxArchiveBytes: 512 * 1024 * 1024,
	maxExtractBytes: 2 * 1024 * 1024 * 1024,
	maxExtractEntries: 20000,
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

const migrateLegacyFileMounts = async ({
	basePath,
	serverId,
	mounts,
}: {
	basePath: string;
	serverId?: string | null;
	mounts: Array<{ type?: string | null; filePath?: string | null }>;
}) => {
	const fileMounts = mounts.filter(
		(mount) => mount.type === "file" && mount.filePath,
	);
	if (fileMounts.length === 0) return;

	if (serverId) {
		const commands = fileMounts
			.map((mount) => {
				const rawPath = mount.filePath ?? "";
				const posixPath = toPosix(rawPath);
				if (!posixPath.startsWith("/")) return null;
				if (posixPath === basePath || posixPath.startsWith(`${basePath}/`)) {
					return null;
				}
				let normalized = "";
				try {
					normalized = normalizeFileMountPath(rawPath);
				} catch {
					return null;
				}
				if (!normalized) return null;
				const targetPath = path.posix.join(basePath, normalized);
				if (posixPath === targetPath) return null;
				return `LEGACY=${shQuote(posixPath)}; TARGET=${shQuote(
					targetPath,
				)}; if [ -e "$LEGACY" ] && [ ! -e "$TARGET" ]; then mkdir -p "$(dirname "$TARGET")"; mv "$LEGACY" "$TARGET"; fi`;
			})
			.filter(Boolean)
			.join("\n");

		if (commands) {
			await execAsyncRemote(serverId, commands);
		}
		return;
	}

	const resolvedBase = path.resolve(basePath);
	for (const mount of fileMounts) {
		const rawPath = mount.filePath ?? "";
		const posixPath = toPosix(rawPath);
		const isAbsolute = path.isAbsolute(rawPath) || posixPath.startsWith("/");
		if (!isAbsolute) continue;
		const resolvedLegacy = path.resolve(rawPath);
		if (
			resolvedLegacy === resolvedBase ||
			resolvedLegacy.startsWith(`${resolvedBase}${path.sep}`)
		) {
			continue;
		}
		let normalized = "";
		try {
			normalized = normalizeFileMountPath(rawPath);
		} catch {
			continue;
		}
		if (!normalized) continue;
		const targetPath = path.join(basePath, normalized);
		if (resolvedLegacy === path.resolve(targetPath)) continue;
		if (!fs.existsSync(rawPath) || fs.existsSync(targetPath)) continue;

		await fs.promises.mkdir(path.dirname(targetPath), { recursive: true });
		try {
			await fs.promises.rename(rawPath, targetPath);
		} catch {
			const stats = await fs.promises.stat(rawPath);
			if (stats.isDirectory()) {
				await fs.promises.cp(rawPath, targetPath, { recursive: true });
				await fs.promises.rm(rawPath, { recursive: true, force: true });
			} else {
				await fs.promises.copyFile(rawPath, targetPath);
				await fs.promises.unlink(rawPath);
			}
		}
	}
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
	let mounts: Array<{ type?: string | null; filePath?: string | null }> = [];

	if (serviceType === "application") {
		const app = await findApplicationById(serviceId);
		appName = app.appName;
		serverId = app.serverId;
		organizationId = app.environment.project.organizationId;
		mounts = app.mounts ?? [];
	} else if (serviceType === "postgres") {
		const postgres = await findPostgresById(serviceId);
		appName = postgres.appName;
		serverId = postgres.serverId;
		organizationId = postgres.environment.project.organizationId;
		mounts = postgres.mounts ?? [];
	} else if (serviceType === "mysql") {
		const mysql = await findMySqlById(serviceId);
		appName = mysql.appName;
		serverId = mysql.serverId;
		organizationId = mysql.environment.project.organizationId;
		mounts = mysql.mounts ?? [];
	} else if (serviceType === "mariadb") {
		const mariadb = await findMariadbById(serviceId);
		appName = mariadb.appName;
		serverId = mariadb.serverId;
		organizationId = mariadb.environment.project.organizationId;
		mounts = mariadb.mounts ?? [];
	} else if (serviceType === "mongo") {
		const mongo = await findMongoById(serviceId);
		appName = mongo.appName;
		serverId = mongo.serverId;
		organizationId = mongo.environment.project.organizationId;
		mounts = mongo.mounts ?? [];
	} else if (serviceType === "redis") {
		const redis = await findRedisById(serviceId);
		appName = redis.appName;
		serverId = redis.serverId;
		organizationId = redis.environment.project.organizationId;
		mounts = redis.mounts ?? [];
	} else if (serviceType === "compose") {
		const compose = await findComposeById(serviceId);
		appName = compose.appName;
		serverId = compose.serverId;
		organizationId = compose.environment.project.organizationId;
		mounts = compose.mounts ?? [];
	}

	const basePaths = paths(!!serverId);
	const rootPath =
		serviceType === "compose"
			? basePaths.COMPOSE_PATH
			: basePaths.APPLICATIONS_PATH;
	const pathLib = getPathLib(serverId);
	const basePath = pathLib.join(rootPath, appName, "files");

	await ensureBaseDirectory(basePath, serverId);
	await migrateLegacyFileMounts({ basePath, serverId, mounts });

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

type ArchiveEntryType = "file" | "directory" | "symlink" | "other";

interface RawArchiveEntry {
	rawPath: string;
	type: ArchiveEntryType;
	size: number;
}

interface NormalizedArchiveEntry {
	path: string;
	type: "file" | "directory";
	size: number;
}

type LocalZipEntry = NormalizedArchiveEntry & {
	zipEntry: ReturnType<AdmZip["getEntries"]>[number];
};

const ARCHIVE_SENTINEL = "__DOKPLOY_ARCHIVE_LIST__";

const archiveFormats: Array<{
	format: FileManagerArchiveFormat;
	suffixes: string[];
	tarFlag?: string;
}> = [
	{ format: "tar.gz", suffixes: [".tar.gz", ".tgz"], tarFlag: "z" },
	{ format: "tar.bz2", suffixes: [".tar.bz2", ".tbz", ".tbz2"], tarFlag: "j" },
	{ format: "tar.xz", suffixes: [".tar.xz", ".txz"], tarFlag: "J" },
	{ format: "tar", suffixes: [".tar"], tarFlag: "" },
	{ format: "zip", suffixes: [".zip"] },
];

const getArchiveFormat = (fileName: string): FileManagerArchiveFormat | null => {
	const lower = fileName.toLowerCase();
	for (const format of archiveFormats) {
		if (format.suffixes.some((suffix) => lower.endsWith(suffix))) {
			return format.format;
		}
	}
	return null;
};

const stripArchiveExtension = (
	fileName: string,
	format: FileManagerArchiveFormat,
) => {
	const lower = fileName.toLowerCase();
	const match = archiveFormats.find((item) => item.format === format);
	if (!match) return fileName;
	const suffix = match.suffixes.find((item) => lower.endsWith(item));
	if (!suffix) return fileName;
	return fileName.slice(0, -suffix.length);
};

const ensureToolsAvailable = async (
	tools: string[],
	serverId?: string | null,
) => {
	if (tools.length === 0) return;
	if (serverId) {
		const command = `missing=""; for tool in ${tools
			.map((tool) => shQuote(tool))
			.join(" ")}; do if ! command -v "$tool" >/dev/null 2>&1; then missing="$missing $tool"; fi; done; echo "$missing"`;
		const { stdout } = await execAsyncRemote(serverId, command);
		if (stdout.trim()) {
			throw new TRPCError({
				code: "NOT_IMPLEMENTED",
				message: `Required tools missing on remote server: ${stdout.trim()}`,
			});
		}
		return;
	}

	for (const tool of tools) {
		try {
			if (process.platform === "win32") {
				await execAsync(`where ${tool}`);
			} else {
				await execAsync(`command -v ${tool}`);
			}
		} catch {
			throw new TRPCError({
				code: "NOT_IMPLEMENTED",
				message: `Required tool not available on server: ${tool}`,
			});
		}
	}
};

const withLocale = (command: string, serverId?: string | null) => {
	if (serverId || process.platform !== "win32") {
		return `LC_ALL=C ${command}`;
	}
	return command;
};

const normalizeArchiveEntryPath = (rawPath: string) => {
	if (!rawPath) return "";
	let value = toPosix(rawPath);
	if (/[\0\r\n\t]/.test(value)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Archive contains unsupported path characters",
		});
	}
	if (value.includes(ARCHIVE_SENTINEL)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Archive path contains unsupported content",
		});
	}
	if (value.startsWith("/")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Archive contains absolute paths",
		});
	}
	value = value.replace(/^\.\/+/, "").replace(/^\/+/, "");
	if (!value) return "";
	if (/^[A-Za-z]:/.test(value)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Archive contains absolute paths",
		});
	}
	const parts = value.split("/").filter(Boolean);
	const normalizedParts: string[] = [];
	for (const part of parts) {
		if (part === ".") continue;
		if (part === "..") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Archive contains unsafe paths",
			});
		}
		normalizedParts.push(part);
	}
	return normalizedParts.join("/");
};

const mapArchiveTypeChar = (typeChar?: string): ArchiveEntryType => {
	if (!typeChar) return "other";
	if (typeChar === "d") return "directory";
	if (typeChar === "-") return "file";
	if (typeChar === "l") return "symlink";
	return "other";
};

const parseZipListOutput = (stdout: string): RawArchiveEntry[] => {
	const entries: RawArchiveEntry[] = [];
	const lines = stdout.split(/\r?\n/);
	const datePatterns = [/^\d{2}-[A-Za-z]{3}-\d{2}$/, /^\d{4}-\d{2}-\d{2}$/];
	for (const line of lines) {
		if (!/^[dl-][rwxstST-]{9}/.test(line)) continue;
		const tokens = line.trim().split(/\s+/);
		if (tokens.length < 9) continue;
		const dateIndex = tokens.findIndex((token) =>
			datePatterns.some((pattern) => pattern.test(token)),
		);
		if (dateIndex === -1 || dateIndex + 2 > tokens.length) continue;
		const sizeIndex = dateIndex - 3;
		if (sizeIndex < 0 || sizeIndex >= tokens.length) continue;
		const size = Number.parseInt(tokens[sizeIndex] || "0", 10);
		const rawPath = tokens.slice(dateIndex + 2).join(" ");
		entries.push({
			rawPath,
			type: mapArchiveTypeChar(tokens[0]?.[0]),
			size: Number.isFinite(size) ? size : 0,
		});
	}
	return entries;
};

const parseTarListOutput = (stdout: string): RawArchiveEntry[] => {
	const entries: RawArchiveEntry[] = [];
	const lines = stdout.split(/\r?\n/);
	for (const line of lines) {
		if (!/^[dl-][rwxstST-]{9}/.test(line)) continue;
		const tokens = line.trim().split(/\s+/);
		if (tokens.length < 6) continue;
		let dateIndex = tokens.findIndex((token) =>
			/^\d{4}-\d{2}-\d{2}$/.test(token),
		);
		let nameStartOffset = 2;
		if (dateIndex === -1) {
			dateIndex = tokens.findIndex(
				(token, index) =>
					/^[A-Za-z]{3}$/.test(token) &&
					/^\d{1,2}$/.test(tokens[index + 1] || "") &&
					/^\d{2}:\d{2}/.test(tokens[index + 2] || ""),
			);
			nameStartOffset = 3;
		}
		if (dateIndex === -1 || dateIndex + nameStartOffset > tokens.length) continue;
		const sizeIndex = dateIndex - 1;
		if (sizeIndex < 0 || sizeIndex >= tokens.length) continue;
		const size = Number.parseInt(tokens[sizeIndex] || "0", 10);
		const rawPath = tokens.slice(dateIndex + nameStartOffset).join(" ");
		entries.push({
			rawPath,
			type: mapArchiveTypeChar(tokens[0]?.[0]),
			size: Number.isFinite(size) ? size : 0,
		});
	}
	return entries;
};

const listZipEntriesLocal = (
	archivePath: string,
	maxEntries: number,
	maxTotalBytes: number,
): { entries: LocalZipEntry[]; totalBytes: number } => {
	const zip = new AdmZip(archivePath);
	const entries: LocalZipEntry[] = [];
	let totalBytes = 0;
	for (const entry of zip.getEntries()) {
		const entryName = entry.entryName;
		if (!entryName || entryName.startsWith("__MACOSX")) continue;
		const isSymlink = (() => {
			const attr = entry.header?.attr ?? 0;
			const mode = (attr >> 16) & 0xffff;
			return (mode & 0o170000) === 0o120000;
		})();
		if (isSymlink) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Archive contains unsupported symbolic links",
			});
		}
		const normalized = normalizeArchiveEntryPath(entryName);
		if (!normalized) continue;
		if (normalized === "__MACOSX" || normalized.startsWith("__MACOSX/")) {
			continue;
		}
		const type = entry.isDirectory ? "directory" : "file";
		const size = entry.isDirectory ? 0 : entry.header?.size ?? 0;
		if (!Number.isFinite(size) || size < 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Archive contains invalid file sizes",
			});
		}
		entries.push({ path: normalized, type, size, zipEntry: entry });
		totalBytes += size;
		if (entries.length > maxEntries) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: "Archive contains too many entries",
			});
		}
		if (totalBytes > maxTotalBytes) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: "Archive exceeds maximum extraction size",
			});
		}
	}
	return { entries, totalBytes };
};

const normalizeArchiveEntries = (
	rawEntries: RawArchiveEntry[],
	maxEntries: number,
	maxTotalBytes: number,
): { entries: NormalizedArchiveEntry[]; totalBytes: number } => {
	const entries: NormalizedArchiveEntry[] = [];
	let totalBytes = 0;
	for (const entry of rawEntries) {
		if (!entry.rawPath || entry.rawPath.startsWith("__MACOSX")) continue;
		const normalized = normalizeArchiveEntryPath(entry.rawPath);
		if (!normalized) continue;
		if (normalized === "__MACOSX" || normalized.startsWith("__MACOSX/")) {
			continue;
		}
		if (entry.type === "symlink" || entry.type === "other") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Archive contains unsupported file types",
			});
		}
		if (!Number.isFinite(entry.size) || entry.size < 0) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Archive contains invalid file sizes",
			});
		}
		entries.push({
			path: normalized,
			type: entry.type === "directory" ? "directory" : "file",
			size: entry.type === "directory" ? 0 : entry.size,
		});
		totalBytes += entry.type === "directory" ? 0 : entry.size;
		if (entries.length > maxEntries) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: "Archive contains too many entries",
			});
		}
		if (totalBytes > maxTotalBytes) {
			throw new TRPCError({
				code: "PAYLOAD_TOO_LARGE",
				message: "Archive exceeds maximum extraction size",
			});
		}
	}
	return { entries, totalBytes };
};

const buildTarFlag = (format: FileManagerArchiveFormat) => {
	const match = archiveFormats.find((item) => item.format === format);
	return match?.tarFlag ?? "";
};

const joinAbsolute = (
	pathLib: typeof path | typeof path.posix,
	basePath: string,
	relativePath: string,
) => {
	const parts = relativePath.split("/").filter(Boolean);
	return pathLib.join(basePath, ...parts);
};

const checkConflictsLocal = async ({
	entries,
	destinationAbsolute,
	onConflict,
	serverId,
}: {
	entries: NormalizedArchiveEntry[];
	destinationAbsolute: string;
	onConflict: FileManagerExtractConflictPolicy;
	serverId?: string | null;
}) => {
	const pathLib = getPathLib(serverId);
	const skipSet = new Set<string>();
	const conflicts: string[] = [];
	for (const entry of entries) {
		const target = joinAbsolute(pathLib, destinationAbsolute, entry.path);
		if (!fs.existsSync(target)) continue;
		const stats = await fs.promises.lstat(target);
		if (stats.isSymbolicLink()) {
			conflicts.push(entry.path);
			continue;
		}
		if (entry.type === "directory") {
			if (!stats.isDirectory()) {
				conflicts.push(entry.path);
			}
			continue;
		}
		if (stats.isDirectory()) {
			conflicts.push(entry.path);
			continue;
		}
		if (onConflict === "fail") {
			conflicts.push(entry.path);
		} else if (onConflict === "skip") {
			skipSet.add(entry.path);
		}
	}
	return { skipSet, conflicts };
};

const checkConflictsRemote = async ({
	entries,
	destinationAbsolute,
	onConflict,
	serverId,
}: {
	entries: NormalizedArchiveEntry[];
	destinationAbsolute: string;
	onConflict: FileManagerExtractConflictPolicy;
	serverId: string;
}) => {
	const payload = entries
		.map((entry) => `${entry.type}\t${entry.path}`)
		.join("\n");
	const command = `
DEST=${shQuote(destinationAbsolute)}
MODE=${shQuote(onConflict)}
TAB=$(printf '\\t')
conflicts=0
skips=0
while IFS="$TAB" read -r entryType entryPath; do
	[ -z "$entryPath" ] && continue
	target="$DEST/$entryPath"
	if [ "$entryType" = "directory" ]; then
		if [ -e "$target" ] && [ ! -d "$target" ]; then
			printf '%s\\n' "$entryPath"
			conflicts=$((conflicts+1))
		fi
	else
		if [ -e "$target" ]; then
			if [ -d "$target" ]; then
				printf '%s\\n' "$entryPath"
				conflicts=$((conflicts+1))
			else
				if [ "$MODE" = "fail" ]; then
					printf '%s\\n' "$entryPath"
					conflicts=$((conflicts+1))
				elif [ "$MODE" = "skip" ]; then
					printf '__SKIP__:%s\\n' "$entryPath"
					skips=$((skips+1))
				fi
			fi
		fi
	fi
done <<'${ARCHIVE_SENTINEL}'
${payload}
${ARCHIVE_SENTINEL}
printf '__SUMMARY__:%s:%s' "$conflicts" "$skips"
`;
	const { stdout } = await execAsyncRemote(serverId, command);
	const lines = stdout.split(/\r?\n/).filter(Boolean);
	const skipSet = new Set<string>();
	const conflicts: string[] = [];
	let summaryLine = "";
	for (const line of lines) {
		if (line.startsWith("__SUMMARY__:")) {
			summaryLine = line;
			continue;
		}
		if (line.startsWith("__SKIP__:")) {
			skipSet.add(line.replace("__SKIP__:", ""));
			continue;
		}
		conflicts.push(line);
	}
	if (!summaryLine) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to validate archive conflicts",
		});
	}
	return { skipSet, conflicts };
};

const ensureDestination = async (
	destinationAbsolute: string,
	serverId?: string | null,
) => {
	if (serverId) {
		await execAsyncRemote(serverId, `mkdir -p ${shQuote(destinationAbsolute)}`);
		return;
	}
	await fs.promises.mkdir(destinationAbsolute, { recursive: true });
};

export const extractFileManagerArchive = async ({
	context,
	path: archivePath,
	destinationPath,
	onConflict = "fail",
	maxEntries = FILE_MANAGER_LIMITS.maxExtractEntries,
	maxTotalBytes = FILE_MANAGER_LIMITS.maxExtractBytes,
	maxArchiveBytes = FILE_MANAGER_LIMITS.maxArchiveBytes,
}: {
	context: FileManagerContext;
	path: string;
	destinationPath?: string;
	onConflict?: FileManagerExtractConflictPolicy;
	maxEntries?: number;
	maxTotalBytes?: number;
	maxArchiveBytes?: number;
}): Promise<FileManagerExtractResult> => {
	const { basePath, serverId } = context;
	const effectiveMaxEntries = Math.min(
		maxEntries ?? FILE_MANAGER_LIMITS.maxExtractEntries,
		FILE_MANAGER_LIMITS.maxExtractEntries,
	);
	const effectiveMaxTotalBytes = Math.min(
		maxTotalBytes ?? FILE_MANAGER_LIMITS.maxExtractBytes,
		FILE_MANAGER_LIMITS.maxExtractBytes,
	);
	const effectiveMaxArchiveBytes = Math.min(
		maxArchiveBytes ?? FILE_MANAGER_LIMITS.maxArchiveBytes,
		FILE_MANAGER_LIMITS.maxArchiveBytes,
	);
	const archiveEntry = await statFileManagerEntry({
		context,
		path: archivePath,
	});
	if (archiveEntry.type !== "file") {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Archive path is not a file",
		});
	}
	if (archiveEntry.size > effectiveMaxArchiveBytes) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: "Archive exceeds maximum allowed size",
		});
	}

	const format = getArchiveFormat(archiveEntry.name || archivePath);
	if (!format) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Unsupported archive format",
		});
	}

	const safeArchive = resolveSafePath(basePath, archivePath, serverId);
	const pathLib = getPathLib(serverId);
	const archiveDir = pathLib.dirname(safeArchive.relative);
	const rawBaseName = stripArchiveExtension(
		pathLib.basename(safeArchive.relative),
		format,
	);
	const archiveBaseName = rawBaseName || "archive";
	const defaultDestination =
		archiveDir && archiveDir !== "."
			? toPosix(pathLib.join(archiveDir, archiveBaseName))
			: archiveBaseName;
	const destinationRelative = normalizeRelativePath(
		destinationPath || defaultDestination,
	);
	const safeDestination = resolveSafePath(
		basePath,
		destinationRelative,
		serverId,
	);

	if (serverId) {
		const checkCommand = `if [ -e ${shQuote(
			safeDestination.absolutePath,
		)} ] && [ ! -d ${shQuote(
			safeDestination.absolutePath,
		)} ]; then echo "__NOT_DIR__"; fi`;
		const { stdout } = await execAsyncRemote(serverId, checkCommand);
		if (stdout.trim() === "__NOT_DIR__") {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Destination path is not a directory",
			});
		}
	} else if (
		fs.existsSync(safeDestination.absolutePath) &&
		!(await fs.promises.stat(safeDestination.absolutePath)).isDirectory()
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Destination path is not a directory",
		});
	}

	if (!Number.isFinite(effectiveMaxEntries) || effectiveMaxEntries < 1) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "maxEntries must be greater than zero",
		});
	}
	if (
		!Number.isFinite(effectiveMaxTotalBytes) ||
		effectiveMaxTotalBytes < 1
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "maxTotalBytes must be greater than zero",
		});
	}

	let entries: NormalizedArchiveEntry[] = [];
	let totalBytes = 0;
	let localZipEntries: LocalZipEntry[] | null = null;

	if (format === "zip" && !serverId) {
		const localZip = listZipEntriesLocal(
			safeArchive.absolutePath,
			effectiveMaxEntries,
			effectiveMaxTotalBytes,
		);
		entries = localZip.entries.map(({ path, type, size }) => ({
			path,
			type,
			size,
		}));
		totalBytes = localZip.totalBytes;
		localZipEntries = localZip.entries;
	} else {
		const tools = format === "zip" ? ["unzip"] : ["tar"];
		await ensureToolsAvailable(tools, serverId);
		if (format === "zip") {
			const command = withLocale(
				`unzip -Z -l ${shQuote(safeArchive.absolutePath)}`,
				serverId,
			);
			const { stdout } = serverId
				? await execAsyncRemote(serverId, command)
				: await execAsync(command);
			const rawEntries = parseZipListOutput(stdout);
			const normalized = normalizeArchiveEntries(
				rawEntries,
				effectiveMaxEntries,
				effectiveMaxTotalBytes,
			);
			entries = normalized.entries;
			totalBytes = normalized.totalBytes;
		} else {
			const tarFlag = buildTarFlag(format);
			const command = withLocale(
				`tar -t${tarFlag}vf ${shQuote(
					safeArchive.absolutePath,
				)} --numeric-owner`,
				serverId,
			);
			const { stdout } = serverId
				? await execAsyncRemote(serverId, command)
				: await execAsync(command);
			const rawEntries = parseTarListOutput(stdout);
			const normalized = normalizeArchiveEntries(
				rawEntries,
				effectiveMaxEntries,
				effectiveMaxTotalBytes,
			);
			entries = normalized.entries;
			totalBytes = normalized.totalBytes;
		}
	}

	if (entries.length === 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Archive contains no extractable entries",
		});
	}

	let skipSet = new Set<string>();
	let conflicts: string[] = [];

	if (serverId) {
		const remoteCheck = await checkConflictsRemote({
			entries,
			destinationAbsolute: safeDestination.absolutePath,
			onConflict,
			serverId,
		});
		skipSet = remoteCheck.skipSet;
		conflicts = remoteCheck.conflicts;
	} else {
		const localCheck = await checkConflictsLocal({
			entries,
			destinationAbsolute: safeDestination.absolutePath,
			onConflict,
			serverId,
		});
		skipSet = localCheck.skipSet;
		conflicts = localCheck.conflicts;
	}

	if (conflicts.length > 0) {
		const preview = conflicts.slice(0, 5).join(", ");
		throw new TRPCError({
			code: "CONFLICT",
			message:
				conflicts.length > 5
					? `Archive conflicts with existing paths: ${preview} and ${conflicts.length - 5} more`
					: `Archive conflicts with existing paths: ${preview}`,
		});
	}

	await ensureDestination(safeDestination.absolutePath, serverId);

	if (format === "zip" && !serverId) {
		if (!localZipEntries) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Unable to read zip entries",
			});
		}
		const pathLib = getPathLib(serverId);
		for (const entry of localZipEntries) {
			if (skipSet.has(entry.path)) continue;
			const target = joinAbsolute(pathLib, safeDestination.absolutePath, entry.path);
			if (entry.type === "directory") {
				await fs.promises.mkdir(target, { recursive: true });
				continue;
			}
			await fs.promises.mkdir(path.dirname(target), { recursive: true });
			await fs.promises.writeFile(target, entry.zipEntry.getData());
		}
	} else if (format === "zip") {
		const modeFlag =
			onConflict === "overwrite" ? "-o" : onConflict === "skip" ? "-n" : "-o";
		const command = `unzip -q ${modeFlag} ${shQuote(
			safeArchive.absolutePath,
		)} -d ${shQuote(safeDestination.absolutePath)}`;
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	} else {
		const tarFlag = buildTarFlag(format);
		const modeFlag = onConflict === "skip" ? "--keep-old-files" : "";
		const command = `tar -x${tarFlag}f ${shQuote(
			safeArchive.absolutePath,
		)} -C ${shQuote(safeDestination.absolutePath)} --no-same-owner --no-same-permissions ${modeFlag}`.trim();
		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}
	}

	const skippedEntries = onConflict === "skip" ? skipSet.size : 0;

	return {
		archivePath: safeArchive.relative,
		destinationPath: safeDestination.relative,
		format,
		extractedEntries: Math.max(entries.length - skippedEntries, 0),
		skippedEntries,
		totalEntries: entries.length,
		totalBytes,
	};
};
