import path from "node:path";
import { TRPCError } from "@trpc/server";
import { type ContainerInfo } from "dockerode";
import {
	FILE_MANAGER_LIMITS,
	type FileManagerEntry,
	type FileManagerEntryType,
	type FileManagerServiceType,
} from "./file-manager";
import { getComposeContainer, getServiceContainer } from "../utils/docker/utils";
import { execAsync, execAsyncRemote } from "../utils/process/execAsync";
import { findApplicationById } from "./application";
import { findComposeById } from "./compose";
import { findMariadbById } from "./mariadb";
import { findMongoById } from "./mongo";
import { findMySqlById } from "./mysql";
import { findPostgresById } from "./postgres";
import { findRedisById } from "./redis";

export interface ContainerFileManagerContext {
	basePath: string;
	serverId?: string | null;
	organizationId: string;
	appName: string;
	serviceType: FileManagerServiceType;
	serviceName?: string | null;
	containerId: string;
	containerName?: string | null;
	containerImage?: string | null;
	containerState?: string | null;
	containerStatus?: string | null;
	containerCreatedAt?: number | null;
}

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

const resolveSafePath = (basePath: string, relativePath?: string) => {
	const safeRelative = normalizeRelativePath(relativePath);
	const absolutePath = path.posix.resolve(basePath, safeRelative);
	const relative = path.posix.relative(basePath, absolutePath);
	const relativePosix = toPosix(relative);
	const segments = relativePosix.split("/").filter(Boolean);
	if (segments.some((seg) => seg === "..")) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Path escapes container root",
		});
	}
	return {
		absolutePath,
		relative: relativePosix || "",
	};
};

const execInContainer = async (
	context: ContainerFileManagerContext,
	command: string,
) => {
	const fullCommand = `docker exec ${context.containerId} sh -lc ${shQuote(
		command,
	)}`;
	if (context.serverId) {
		return execAsyncRemote(context.serverId, fullCommand);
	}
	return execAsync(fullCommand);
};

const formatEntry = (
	absolutePath: string,
	basePath: string,
	type: FileManagerEntryType,
	stats: { size: number; mtime: Date },
): FileManagerEntry => {
	const relativePath = toPosix(path.posix.relative(basePath, absolutePath));
	const name = path.posix.basename(absolutePath);
	return {
		name,
		path: relativePath,
		type,
		size: type === "directory" ? 0 : stats.size,
		extension: type === "file" ? path.posix.extname(name).slice(1) : undefined,
		modifiedAt: stats.mtime.toISOString(),
	};
};

const ensureContainerTools = async (
	context: ContainerFileManagerContext,
	tools: string[],
) => {
	if (tools.length === 0) return;
	const command = `missing=""; for tool in ${tools
		.map((tool) => shQuote(tool))
		.join(" ")}; do if ! command -v "$tool" >/dev/null 2>&1; then missing="$missing $tool"; fi; done; echo "$missing"`;
	const { stdout } = await execInContainer(context, command);
	if (stdout.trim()) {
		throw new TRPCError({
			code: "FAILED_PRECONDITION",
			message: `Container is missing required tools: ${stdout.trim()}. Install them or use mounts instead.`,
		});
	}
};

const resolveContainerContext = async (
	serviceType: FileManagerServiceType,
	serviceId: string,
	options?: { serviceName?: string | null },
): Promise<{ context: ContainerFileManagerContext; container: ContainerInfo }> => {
	let appName = "";
	let serverId: string | null | undefined = null;
	let organizationId = "";
	let serviceName: string | null | undefined = options?.serviceName;
	let compose: Awaited<ReturnType<typeof findComposeById>> | null = null;

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
		compose = await findComposeById(serviceId);
		appName = compose.appName;
		serverId = compose.serverId;
		organizationId = compose.environment.project.organizationId;
		if (!serviceName) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Compose service name is required for container access.",
			});
		}
	}

	let container: ContainerInfo | null = null;
	if (serviceType === "compose") {
		if (!compose) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Compose service not found",
			});
		}
		container = await getComposeContainer(compose, serviceName || "");
	} else {
		container = await getServiceContainer(appName, serverId ?? null);
	}
	if (!container) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message:
				"No running container found for this service. Deploy or start it first.",
		});
	}

	return {
		context: {
			basePath: "/",
			serverId,
			organizationId,
			appName,
			serviceType,
			serviceName: serviceName ?? null,
			containerId: container.Id,
			containerName: container.Names?.[0]?.replace(/^\//, "") ?? null,
			containerImage: container.Image ?? null,
			containerState: container.State ?? null,
			containerStatus: container.Status ?? null,
			containerCreatedAt: container.Created ?? null,
		},
		container,
	};
};

export const resolveContainerFileManagerContext = async (
	serviceType: FileManagerServiceType,
	serviceId: string,
	options?: { serviceName?: string | null },
) => {
	const { context } = await resolveContainerContext(
		serviceType,
		serviceId,
		options,
	);
	return context;
};

export const getContainerFileManagerStatus = async (
	serviceType: FileManagerServiceType,
	serviceId: string,
	options?: { serviceName?: string | null },
) => {
	const { context } = await resolveContainerContext(
		serviceType,
		serviceId,
		options,
	);
	return {
		containerId: context.containerId,
		containerName: context.containerName,
		containerImage: context.containerImage,
		containerState: context.containerState,
		containerStatus: context.containerStatus,
		containerCreatedAt: context.containerCreatedAt,
	};
};

export const listContainerFileManagerEntries = async ({
	context,
	path: relativePath,
	includeHidden = false,
	limit = FILE_MANAGER_LIMITS.maxListEntries,
}: {
	context: ContainerFileManagerContext;
	path?: string;
	includeHidden?: boolean;
	limit?: number;
}) => {
	const { basePath } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath);
	const entries: FileManagerEntry[] = [];

	const command = `
TARGET=${shQuote(absolutePath)}
if [ ! -d "$TARGET" ]; then
	echo "__MISSING__"
	exit 0
fi
if find "$TARGET" -maxdepth 0 -printf '' >/dev/null 2>&1; then
	find "$TARGET" -mindepth 1 -maxdepth 1 -printf '%y\\t%s\\t%T@\\t%p\\0'
else
	ls -1A "$TARGET" 2>/dev/null | while IFS= read -r name; do
		[ -z "$name" ] && continue
		entry="$TARGET/$name"
		[ -L "$entry" ] && continue
		if [ -d "$entry" ]; then type="d"; else type="f"; fi
		size=$(stat -c '%s' "$entry" 2>/dev/null || wc -c < "$entry" 2>/dev/null || echo 0)
		mtime=$(stat -c '%Y' "$entry" 2>/dev/null || echo 0)
		printf '%s\\t%s\\t%s\\t%s\\0' "$type" "$size" "$mtime" "$entry"
	done
fi
`;
	const { stdout } = await execInContainer(context, command);
	if (stdout.trim() === "__MISSING__") {
		return [];
	}
	const records = stdout.split("\0").filter(Boolean);
	for (const record of records) {
		if (entries.length >= limit) break;
		const [typeFlag, sizeRaw, mtimeRaw, fullPath = ""] = record.split("\t");
		if (!fullPath) continue;
		const name = path.posix.basename(fullPath);
		if (!includeHidden && name.startsWith(".")) continue;
		if (typeFlag === "l") continue;
		const type = typeFlag === "d" ? "directory" : "file";
		const size = Number.parseInt(sizeRaw || "0", 10) || 0;
		const modifiedAt = new Date(Number.parseFloat(mtimeRaw || "0") * 1000);
		entries.push(
			formatEntry(fullPath, basePath, type, {
				size,
				mtime: modifiedAt,
			}),
		);
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

export const statContainerFileManagerEntry = async ({
	context,
	path: relativePath,
}: {
	context: ContainerFileManagerContext;
	path: string;
}): Promise<FileManagerEntry> => {
	const { basePath } = context;
	const { absolutePath } = resolveSafePath(basePath, relativePath);
	const command = `
TARGET=${shQuote(absolutePath)}
if [ ! -e "$TARGET" ]; then
	echo "__MISSING__"
	exit 0
fi
if [ -d "$TARGET" ]; then type="directory"; else type="file"; fi
	size=$(stat -c '%s' "$TARGET" 2>/dev/null || wc -c < "$TARGET" 2>/dev/null || echo 0)
	mtime=$(stat -c '%Y' "$TARGET" 2>/dev/null || echo 0)
printf '%s|%s|%s' "$type" "$size" "$mtime"
`;
	const { stdout } = await execInContainer(context, command);
	if (stdout.trim() === "__MISSING__") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Path not found in container",
		});
	}
	const [typeRaw, sizeRaw, mtimeRaw] = stdout.trim().split("|");
	const type = typeRaw === "directory" ? "directory" : "file";
	const size = Number.parseInt(sizeRaw || "0", 10) || 0;
	const modifiedAt = new Date(Number.parseInt(mtimeRaw || "0", 10) * 1000);
	return formatEntry(absolutePath, basePath, type, {
		size,
		mtime: modifiedAt,
	});
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

export const readContainerFileManagerFile = async ({
	context,
	path: relativePath,
	encoding = "utf8",
}: {
	context: ContainerFileManagerContext;
	path: string;
	encoding?: "utf8" | "base64";
}) => {
	const entry = await statContainerFileManagerEntry({
		context,
		path: relativePath,
	});

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

	await ensureContainerTools(context, ["base64", "tr"]);
	const { absolutePath } = resolveSafePath(context.basePath, relativePath);
	const command = `base64 ${shQuote(absolutePath)} | tr -d '\\n'`;
	const { stdout } = await execInContainer(context, command);
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
};

export const writeContainerFileManagerFile = async ({
	context,
	path: relativePath,
	content,
	encoding = "utf8",
	overwrite = false,
}: {
	context: ContainerFileManagerContext;
	path: string;
	content: string;
	encoding?: "utf8" | "base64";
	overwrite?: boolean;
}) => {
	const { absolutePath } = resolveSafePath(context.basePath, relativePath);
	const buffer =
		encoding === "base64" ? Buffer.from(content, "base64") : Buffer.from(content);

	if (buffer.length > FILE_MANAGER_LIMITS.maxWriteBytes) {
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: "File exceeds write size limit",
		});
	}

	if (!overwrite) {
		const existsCheck = `if [ -e ${shQuote(
			absolutePath,
		)} ]; then echo "__EXISTS__"; fi`;
		const { stdout } = await execInContainer(context, existsCheck);
		if (stdout.trim() === "__EXISTS__") {
			throw new TRPCError({
				code: "CONFLICT",
				message: "File already exists",
			});
		}
	}

	await ensureContainerTools(context, ["base64"]);
	const directory = path.posix.dirname(absolutePath);
	const encoded = buffer.toString("base64");
	const command = `
mkdir -p ${shQuote(directory)}
printf %s ${shQuote(encoded)} | base64 -d > ${shQuote(absolutePath)}
`;
	await execInContainer(context, command);
	return statContainerFileManagerEntry({ context, path: relativePath });
};

export const createContainerFileManagerDirectory = async ({
	context,
	path: relativePath,
}: {
	context: ContainerFileManagerContext;
	path: string;
}) => {
	const { absolutePath } = resolveSafePath(context.basePath, relativePath);
	await execInContainer(context, `mkdir -p ${shQuote(absolutePath)}`);
	return statContainerFileManagerEntry({ context, path: relativePath });
};

export const deleteContainerFileManagerEntry = async ({
	context,
	path: relativePath,
	recursive = false,
}: {
	context: ContainerFileManagerContext;
	path: string;
	recursive?: boolean;
}) => {
	const { absolutePath } = resolveSafePath(context.basePath, relativePath);
	const entry = await statContainerFileManagerEntry({
		context,
		path: relativePath,
	});
	if (entry.type === "directory") {
		const command = recursive
			? `rm -rf ${shQuote(absolutePath)}`
			: `rmdir ${shQuote(absolutePath)}`;
		await execInContainer(context, command);
	} else {
		await execInContainer(context, `rm -f ${shQuote(absolutePath)}`);
	}
	return true;
};

export const moveContainerFileManagerEntry = async ({
	context,
	from,
	to,
}: {
	context: ContainerFileManagerContext;
	from: string;
	to: string;
}) => {
	const fromPath = resolveSafePath(context.basePath, from).absolutePath;
	const toPath = resolveSafePath(context.basePath, to).absolutePath;
	const directory = path.posix.dirname(toPath);
	const command = `
mkdir -p ${shQuote(directory)}
mv ${shQuote(fromPath)} ${shQuote(toPath)}
`;
	await execInContainer(context, command);
	return statContainerFileManagerEntry({ context, path: to });
};

export const copyContainerFileManagerEntry = async ({
	context,
	from,
	to,
}: {
	context: ContainerFileManagerContext;
	from: string;
	to: string;
}) => {
	const fromPath = resolveSafePath(context.basePath, from).absolutePath;
	const toPath = resolveSafePath(context.basePath, to).absolutePath;
	const directory = path.posix.dirname(toPath);
	const command = `
mkdir -p ${shQuote(directory)}
cp -R ${shQuote(fromPath)} ${shQuote(toPath)}
`;
	await execInContainer(context, command);
	return statContainerFileManagerEntry({ context, path: to });
};

export const searchContainerFileManagerEntries = async ({
	context,
	query,
	path: relativePath,
	includeHidden = false,
	limit = FILE_MANAGER_LIMITS.maxSearchResults,
	maxDepth = FILE_MANAGER_LIMITS.maxSearchDepth,
}: {
	context: ContainerFileManagerContext;
	query: string;
	path?: string;
	includeHidden?: boolean;
	limit?: number;
	maxDepth?: number;
}) => {
	const { absolutePath } = resolveSafePath(context.basePath, relativePath);
	const sanitizedQuery = query.trim();
	if (!sanitizedQuery) return [];

	const results: FileManagerEntry[] = [];
	const depthLimit = Math.max(
		1,
		Math.min(maxDepth, FILE_MANAGER_LIMITS.maxSearchDepth),
	);

	const pattern = `*${sanitizedQuery.replace(/'/g, "")}*`;
	const command = `
TARGET=${shQuote(absolutePath)}
if [ ! -d "$TARGET" ]; then
	exit 0
fi
if find "$TARGET" -maxdepth 0 -printf '' >/dev/null 2>&1; then
	find "$TARGET" -maxdepth ${depthLimit} -iname ${shQuote(
		pattern,
	)} -printf '%y\\t%s\\t%T@\\t%p\\0'
else
	find "$TARGET" -maxdepth ${depthLimit} -iname ${shQuote(
		pattern,
	)} -print 2>/dev/null | while IFS= read -r entry; do
		[ -z "$entry" ] && continue
		[ -L "$entry" ] && continue
		if [ -d "$entry" ]; then type="d"; else type="f"; fi
		size=$(stat -c '%s' "$entry" 2>/dev/null || wc -c < "$entry" 2>/dev/null || echo 0)
		mtime=$(stat -c '%Y' "$entry" 2>/dev/null || echo 0)
		printf '%s\\t%s\\t%s\\t%s\\0' "$type" "$size" "$mtime" "$entry"
	done
fi
`;
	const { stdout } = await execInContainer(context, command);
	const records = stdout.split("\0").filter(Boolean);
	for (const record of records) {
		if (results.length >= limit) break;
		const [typeFlag, sizeRaw, mtimeRaw, fullPath = ""] = record.split("\t");
		if (!fullPath) continue;
		const name = path.posix.basename(fullPath);
		if (!includeHidden && name.startsWith(".")) continue;
		if (typeFlag === "l") continue;
		const type = typeFlag === "d" ? "directory" : "file";
		const size = Number.parseInt(sizeRaw || "0", 10) || 0;
		const modifiedAt = new Date(Number.parseFloat(mtimeRaw || "0") * 1000);
		results.push(
			formatEntry(fullPath, context.basePath, type, {
				size,
				mtime: modifiedAt,
			}),
		);
	}

	return results;
};

const CONTAINER_SNAPSHOT_DEFAULT_LIMIT_BYTES = 8 * 1024 * 1024;

export const snapshotContainerFileManager = async ({
	context,
	path: relativePath,
	maxBytes = CONTAINER_SNAPSHOT_DEFAULT_LIMIT_BYTES,
}: {
	context: ContainerFileManagerContext;
	path?: string;
	maxBytes?: number;
}) => {
	if (maxBytes < 1 || maxBytes > 50 * 1024 * 1024) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Snapshot size limit must be between 1 byte and 50 MB.",
		});
	}

	await ensureContainerTools(context, ["tar", "base64", "wc", "tr"]);
	const { absolutePath } = resolveSafePath(context.basePath, relativePath);
	const baseName =
		absolutePath === "/" ? "root" : path.posix.basename(absolutePath);
	const baseDir = path.posix.dirname(absolutePath);
	const command = `
TARGET=${shQuote(absolutePath)}
if [ ! -e "$TARGET" ]; then
	echo "__MISSING__"
	exit 0
fi
SIZE=$(tar -C ${shQuote(baseDir)} -czf - ${shQuote(
		baseName,
	)} 2>/dev/null | wc -c)
if [ "$SIZE" -gt ${Math.floor(maxBytes)} ]; then
	echo "__TOO_LARGE__:$SIZE"
	exit 0
fi
tar -C ${shQuote(baseDir)} -czf - ${shQuote(
		baseName,
	)} 2>/dev/null | base64 | tr -d '\\n'
`;
	const { stdout } = await execInContainer(context, command);
	const trimmed = stdout.trim();
	if (trimmed === "__MISSING__") {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Path not found in container",
		});
	}
	if (trimmed.startsWith("__TOO_LARGE__:")) {
		const size = Number.parseInt(trimmed.split(":")[1] || "0", 10) || 0;
		throw new TRPCError({
			code: "PAYLOAD_TOO_LARGE",
			message: `Snapshot is ${size} bytes which exceeds the limit of ${maxBytes} bytes.`,
		});
	}

	return {
		fileName: `${baseName || "snapshot"}.tar.gz`,
		content: trimmed,
		encoding: "base64" as const,
	};
};
