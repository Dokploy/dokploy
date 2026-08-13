import { posix } from "node:path";
import type { Readable, Writable } from "node:stream";
import { Transform } from "node:stream";
import type { ContainerInfo } from "dockerode";
import { extract } from "tar-stream";
import { getRemoteDocker } from "../utils/servers/remote-docker";

const MAX_PATH_LENGTH = 4096;
const MAX_PATH_COMPONENTS = 128;
const MAX_DIRECTORY_ARCHIVE_BYTES = 32 * 1024 * 1024;
const MAX_DIRECTORY_ENTRIES = 2000;
const PATH_INSPECTION_TIMEOUT_MS = 10_000;
const ARCHIVE_REQUEST_TIMEOUT_MS = 10_000;
export const MAX_FILE_PREVIEW_BYTES = 1024 * 1024;
export const MAX_FILE_DOWNLOAD_BYTES = 100 * 1024 * 1024;

const RESTRICTED_PATHS = ["/proc", "/sys", "/dev", "/run/secrets"];
const CONTAINER_ID_REGEX = /^[a-f0-9]{64}$/i;

const hasControlCharacter = (value: string) =>
	[...value].some((character) => {
		const code = character.charCodeAt(0);
		return code <= 0x1f || code === 0x7f;
	});

export type ContainerFilesystemEntryType =
	| "directory"
	| "file"
	| "symlink"
	| "other";

export type ContainerFilesystemEntry = {
	name: string;
	path: string;
	type: ContainerFilesystemEntryType;
	size?: number;
	modifiedAt?: string;
	mode?: string;
	linkTarget?: string;
};

export type ApplicationFilesystemContainer = {
	containerId: string;
	name: string;
	image?: string;
	state: string;
	status?: string;
};

export type ContainerFilePreview =
	| {
			kind: "text";
			content: string;
			size: number;
			encoding: "utf-8";
	  }
	| { kind: "binary"; size: number }
	| { kind: "too_large"; size: number };

type DockerClient = Awaited<ReturnType<typeof getRemoteDocker>>;
type DockerContainer = ReturnType<DockerClient["getContainer"]>;

type ArchiveStat = {
	name?: string;
	size?: number;
	mode?: number;
	mtime?: string;
	linkTarget?: string;
};

type VerifiedArchiveStat = ArchiveStat & {
	size: number;
	mode: number;
};

type TarHeader = {
	name: string;
	size: number;
	mode?: number;
	mtime?: Date;
	type?: string;
	linkname?: string;
};

export class ContainerFilesystemError extends Error {
	constructor(
		public readonly code:
			| "INVALID_PATH"
			| "RESTRICTED_PATH"
			| "CONTAINER_NOT_FOUND"
			| "DIRECTORY_TOO_LARGE"
			| "FILE_TOO_LARGE"
			| "NOT_A_DIRECTORY"
			| "NOT_A_FILE"
			| "SYMLINK_NOT_SUPPORTED"
			| "ARCHIVE_UNAVAILABLE",
		message: string,
	) {
		super(message);
		this.name = "ContainerFilesystemError";
	}
}

export const normalizeContainerPath = (input: string): string => {
	if (typeof input !== "string" || input.length === 0) {
		throw new ContainerFilesystemError(
			"INVALID_PATH",
			"A container path is required.",
		);
	}

	if (input.length > MAX_PATH_LENGTH || hasControlCharacter(input)) {
		throw new ContainerFilesystemError(
			"INVALID_PATH",
			"The container path is invalid.",
		);
	}

	if (!input.startsWith("/") || input.includes("\\")) {
		throw new ContainerFilesystemError(
			"INVALID_PATH",
			"Container paths must be absolute POSIX paths.",
		);
	}

	if (input.split("/").some((segment) => segment === "..")) {
		throw new ContainerFilesystemError(
			"INVALID_PATH",
			"Path traversal is not allowed.",
		);
	}

	const normalized = posix.normalize(input);
	if (normalized.split("/").filter(Boolean).length > MAX_PATH_COMPONENTS) {
		throw new ContainerFilesystemError(
			"INVALID_PATH",
			"The container path has too many nested directories.",
		);
	}
	const restricted = RESTRICTED_PATHS.some(
		(path) => normalized === path || normalized.startsWith(`${path}/`),
	);

	if (restricted) {
		throw new ContainerFilesystemError(
			"RESTRICTED_PATH",
			"This virtual or secret-backed path cannot be browsed.",
		);
	}

	return normalized;
};

const normalizeContainerId = (containerId: string) => {
	if (!CONTAINER_ID_REGEX.test(containerId)) {
		throw new ContainerFilesystemError(
			"CONTAINER_NOT_FOUND",
			"The selected container is invalid.",
		);
	}
	return containerId;
};

const getContainerName = (container: ContainerInfo) =>
	container.Names?.[0]?.replace(/^\//, "") || container.Id;

const mapContainer = (
	container: ContainerInfo,
): ApplicationFilesystemContainer => ({
	containerId: container.Id,
	name: getContainerName(container),
	image: container.Image,
	state: container.State || "unknown",
	status: container.Status,
});

const getRunningContainers = async (
	docker: DockerClient,
	appName: string,
): Promise<ContainerInfo[]> => {
	const filters = {
		status: ["running"],
		label: [`com.docker.swarm.service.name=${appName}`],
	};

	const containers = await docker.listContainers({
		filters: JSON.stringify(filters),
	});
	return containers.filter(
		(container) =>
			container.State === "running" &&
			container.Labels?.["com.docker.swarm.service.name"] === appName,
	);
};

export const getApplicationFilesystemContainers = async (
	appName: string,
	serverId?: string | null,
): Promise<ApplicationFilesystemContainer[]> => {
	const docker = await getRemoteDocker(serverId);
	const containers = await getRunningContainers(docker, appName);

	return containers
		.map(mapContainer)
		.sort((first, second) => first.name.localeCompare(second.name));
};

export const getApplicationFilesystemContainer = async (
	appName: string,
	containerId: string,
	serverId?: string | null,
): Promise<{
	container: DockerContainer;
	containerInfo: ApplicationFilesystemContainer;
}> => {
	const normalizedContainerId = normalizeContainerId(containerId);
	const docker = await getRemoteDocker(serverId);
	const containers = await getRunningContainers(docker, appName);
	const selected = containers.find(
		(container) => container.Id === normalizedContainerId,
	);

	if (!selected) {
		throw new ContainerFilesystemError(
			"CONTAINER_NOT_FOUND",
			"The selected container is not a running container for this application.",
		);
	}

	return {
		container: docker.getContainer(selected.Id),
		containerInfo: mapContainer(selected),
	};
};

const asReadable = (stream: NodeJS.ReadableStream): Readable =>
	stream as Readable;

const readStreamWithLimit = async (
	stream: NodeJS.ReadableStream,
	maxBytes: number,
	error: ContainerFilesystemError,
): Promise<Buffer> => {
	const chunks: Buffer[] = [];
	let bytes = 0;

	try {
		for await (const chunk of asReadable(stream)) {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			bytes += buffer.length;
			if (bytes > maxBytes) {
				asReadable(stream).destroy(error);
				throw error;
			}
			chunks.push(buffer);
		}
	} catch (cause) {
		if (cause === error) throw cause;
		throw cause;
	}

	return Buffer.concat(chunks);
};

const parseArchiveStat = (
	stream: NodeJS.ReadableStream,
): ArchiveStat | undefined => {
	const headers = (
		stream as Readable & {
			headers?: Record<string, string | string[] | undefined>;
		}
	).headers;
	const encoded = headers?.["x-docker-container-path-stat"];
	const value = Array.isArray(encoded) ? encoded[0] : encoded;

	if (!value) return undefined;

	try {
		return JSON.parse(
			Buffer.from(value, "base64").toString("utf8"),
		) as ArchiveStat;
	} catch {
		return undefined;
	}
};

const requireArchiveStat = (
	stream: NodeJS.ReadableStream,
): VerifiedArchiveStat => {
	const stat = parseArchiveStat(stream);
	if (typeof stat?.mode !== "number" || typeof stat.size !== "number") {
		throw new ContainerFilesystemError(
			"ARCHIVE_UNAVAILABLE",
			"Docker did not return valid metadata for the selected path.",
		);
	}

	return stat as VerifiedArchiveStat;
};

const entryTypeFromMode = (mode?: number): ContainerFilesystemEntryType => {
	const fileType = (mode ?? 0) & 0o170000;
	if (fileType === 0o040000) return "directory";
	if (fileType === 0o120000) return "symlink";
	if (fileType === 0o100000) return "file";
	return "other";
};

// The X-Docker-Container-Path-Stat header encodes Go's os.FileMode instead
// of the POSIX mode used in tar headers. Its high bits mark directories and
// symlinks, while an unmarked path is a regular file.
const entryTypeFromArchiveStat = (
	stat: VerifiedArchiveStat,
): ContainerFilesystemEntryType => {
	const mode = stat.mode >>> 0;
	if ((mode & 0x80000000) !== 0) return "directory";
	if ((mode & 0x08000000) !== 0) return "symlink";
	if ((mode & 0x07000000) !== 0) return "other";
	return "file";
};

const entryTypeFromTarHeader = (
	header: TarHeader,
): ContainerFilesystemEntryType => {
	if (header.type === "directory") return "directory";
	if (header.type === "symlink") return "symlink";
	if (header.type === "file" || header.type === "contiguous-file")
		return "file";
	return entryTypeFromMode(header.mode);
};

const addEntry = (
	entries: Map<string, ContainerFilesystemEntry>,
	entry: ContainerFilesystemEntry,
) => {
	if (entries.size >= MAX_DIRECTORY_ENTRIES && !entries.has(entry.path)) {
		throw new ContainerFilesystemError(
			"DIRECTORY_TOO_LARGE",
			`This directory contains more than ${MAX_DIRECTORY_ENTRIES} entries.`,
		);
	}

	const current = entries.get(entry.path);
	if (
		!current ||
		(current.type !== "directory" && entry.type === "directory")
	) {
		entries.set(entry.path, entry);
	}
};

// Docker's GET archive operation resolves symlinks. HEAD archive responses
// contain lstat metadata, so every path component is checked before an archive
// is requested. Docker has no atomic no-follow archive API, therefore this is
// a best-effort check against a live container and is repeated per request.
const inspectContainerPath = async (
	container: DockerContainer,
	path: string,
): Promise<VerifiedArchiveStat> => {
	const pathComponents = path.split("/").filter(Boolean);
	const pathsToInspect =
		path === "/"
			? [path]
			: pathComponents.map(
					(_component, index) =>
						`/${pathComponents.slice(0, index + 1).join("/")}`,
				);
	let finalStat: VerifiedArchiveStat | undefined;
	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort(),
		PATH_INSPECTION_TIMEOUT_MS,
	);

	try {
		for (const currentPath of pathsToInspect) {
			let response: NodeJS.ReadableStream | undefined;
			try {
				response = (await container.infoArchive({
					path: currentPath,
					abortSignal: abortController.signal,
				})) as NodeJS.ReadableStream;
				const stat = requireArchiveStat(response);
				const type = entryTypeFromArchiveStat(stat);

				if (type === "symlink" || Boolean(stat.linkTarget)) {
					throw new ContainerFilesystemError(
						"SYMLINK_NOT_SUPPORTED",
						"Paths containing symlinks cannot be opened from the file browser.",
					);
				}
				if (currentPath !== path && type !== "directory") {
					throw new ContainerFilesystemError(
						"NOT_A_DIRECTORY",
						"Every parent path must be a directory.",
					);
				}

				finalStat = stat;
			} finally {
				if (response) asReadable(response).resume();
			}
		}
	} catch (error) {
		if (error instanceof ContainerFilesystemError) throw error;
		if (abortController.signal.aborted) {
			throw new ContainerFilesystemError(
				"ARCHIVE_UNAVAILABLE",
				"The container took too long to inspect this path.",
			);
		}
		throw new ContainerFilesystemError(
			"ARCHIVE_UNAVAILABLE",
			"The container could not safely inspect this path.",
		);
	} finally {
		clearTimeout(timeout);
	}

	if (!finalStat) {
		throw new ContainerFilesystemError(
			"ARCHIVE_UNAVAILABLE",
			"Docker did not return metadata for the selected path.",
		);
	}

	return finalStat;
};

const getContainerArchive = async (
	container: DockerContainer,
	path: string,
): Promise<NodeJS.ReadableStream> => {
	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort(),
		ARCHIVE_REQUEST_TIMEOUT_MS,
	);

	try {
		return (await container.getArchive({
			path,
			abortSignal: abortController.signal,
		})) as NodeJS.ReadableStream;
	} catch (error) {
		if (abortController.signal.aborted) {
			throw new ContainerFilesystemError(
				"ARCHIVE_UNAVAILABLE",
				"The container took too long to retrieve this path.",
			);
		}
		throw new ContainerFilesystemError(
			"ARCHIVE_UNAVAILABLE",
			"The container could not retrieve this path.",
		);
	} finally {
		clearTimeout(timeout);
	}
};

const getDirectChild = (path: string, tarName: string) => {
	const cleanName = tarName
		.replace(/^\.\//, "")
		.replace(/^\/+/, "")
		.replace(/\/$/, "");
	if (!cleanName || cleanName === ".") return undefined;

	let relative = cleanName;
	if (path !== "/") {
		const requested = path.slice(1);
		const archiveRoot = posix.basename(path);
		const prefixes = [requested, archiveRoot];
		const matchedPrefix = prefixes.find(
			(prefix) => cleanName === prefix || cleanName.startsWith(`${prefix}/`),
		);

		if (!matchedPrefix || cleanName === matchedPrefix) return undefined;
		relative = cleanName.slice(matchedPrefix.length + 1);
	}

	const segments = relative.split("/");
	if (segments.some((segment) => !segment || segment === ".."))
		return undefined;

	return {
		name: segments[0] as string,
		isNested: segments.length > 1,
	};
};

const listDirectoryFromArchive = async (
	container: DockerContainer,
	path: string,
): Promise<ContainerFilesystemEntry[]> => {
	const archive = await getContainerArchive(container, path);
	const stat = requireArchiveStat(archive);
	ensureDirectoryStat(stat);
	const extractor = extract();
	const entries = new Map<string, ContainerFilesystemEntry>();
	let failure: Error | undefined;

	const finished = new Promise<void>((resolve, reject) => {
		extractor.on(
			"entry",
			(header: TarHeader, entry: Readable, next: () => void) => {
				try {
					const child = getDirectChild(path, header.name);
					if (child) {
						addEntry(entries, {
							name: child.name,
							path: path === "/" ? `/${child.name}` : `${path}/${child.name}`,
							type: child.isNested
								? "directory"
								: entryTypeFromTarHeader(header),
							size: child.isNested ? undefined : header.size,
							modifiedAt: header.mtime?.toISOString(),
							mode: header.mode?.toString(8),
							linkTarget: header.linkname,
						});
					}
				} catch (error) {
					failure = error instanceof Error ? error : new Error(String(error));
					entry.destroy(failure);
					extractor.destroy(failure);
					return;
				}

				entry.resume();
				entry.once("end", next);
				entry.once("error", reject);
			},
		);
		extractor.once("finish", resolve);
		extractor.once("error", reject);
	});

	try {
		const source = asReadable(archive);
		let archiveBytes = 0;
		source.on("data", (chunk: Buffer) => {
			archiveBytes += chunk.length;
			if (archiveBytes > MAX_DIRECTORY_ARCHIVE_BYTES) {
				const error = new ContainerFilesystemError(
					"DIRECTORY_TOO_LARGE",
					"The directory is too large to browse safely.",
				);
				failure = error;
				source.destroy(error);
				extractor.destroy(error);
			}
		});
		source.once("error", (error) => extractor.destroy(error));
		source.pipe(extractor);
		await finished;
	} catch (error) {
		throw failure ?? error;
	}

	return [...entries.values()].sort((first, second) =>
		first.name.localeCompare(second.name),
	);
};

const ensureDirectoryStat = (stat: VerifiedArchiveStat) => {
	const type = entryTypeFromArchiveStat(stat);
	if (type === "symlink") {
		throw new ContainerFilesystemError(
			"SYMLINK_NOT_SUPPORTED",
			"Symlinks cannot be opened from the file browser.",
		);
	}
	if (type !== "directory") {
		throw new ContainerFilesystemError(
			"NOT_A_DIRECTORY",
			"Only directories can be opened in the file browser.",
		);
	}
};

export const listContainerDirectory = async (
	container: DockerContainer,
	inputPath: string,
): Promise<{ path: string; entries: ContainerFilesystemEntry[] }> => {
	const path = normalizeContainerPath(inputPath);
	ensureDirectoryStat(await inspectContainerPath(container, path));
	return { path, entries: await listDirectoryFromArchive(container, path) };
};

const isText = (buffer: Buffer) => {
	if (buffer.includes(0)) return false;
	try {
		new TextDecoder("utf-8", { fatal: true }).decode(buffer);
		return true;
	} catch {
		return false;
	}
};

const ensureFileStat = (stat: VerifiedArchiveStat) => {
	const type = entryTypeFromArchiveStat(stat);
	if (type === "symlink") {
		throw new ContainerFilesystemError(
			"SYMLINK_NOT_SUPPORTED",
			"Symlinks cannot be opened from the file browser.",
		);
	}
	if (type !== "file") {
		throw new ContainerFilesystemError(
			"NOT_A_FILE",
			"Only regular files can be opened from the file browser.",
		);
	}
	if (stat.size > MAX_FILE_DOWNLOAD_BYTES) {
		throw new ContainerFilesystemError(
			"FILE_TOO_LARGE",
			`Files larger than ${MAX_FILE_DOWNLOAD_BYTES} bytes cannot be downloaded.`,
		);
	}
};

const readFirstArchiveFile = async (
	archive: NodeJS.ReadableStream,
	maxBytes: number,
): Promise<Buffer> => {
	const extractor = extract();
	let found = false;

	const finished = new Promise<Buffer>((resolve, reject) => {
		extractor.on(
			"entry",
			(header: TarHeader, entry: Readable, next: () => void) => {
				if (found || entryTypeFromTarHeader(header) !== "file") {
					entry.resume();
					entry.once("end", next);
					entry.once("error", reject);
					return;
				}

				found = true;
				const body = readStreamWithLimit(
					entry,
					maxBytes,
					new ContainerFilesystemError(
						"FILE_TOO_LARGE",
						"The file is too large to read safely.",
					),
				);
				body.then(resolve, reject).finally(next);
			},
		);
		extractor.once("finish", () => {
			if (!found) {
				reject(
					new ContainerFilesystemError(
						"NOT_A_FILE",
						"The selected path does not contain a regular file.",
					),
				);
			}
		});
		extractor.once("error", reject);
	});

	const source = asReadable(archive);
	source.once("error", (error) => extractor.destroy(error));
	source.pipe(extractor);
	return finished;
};

export const readContainerFile = async (
	container: DockerContainer,
	inputPath: string,
): Promise<ContainerFilePreview> => {
	const path = normalizeContainerPath(inputPath);
	ensureFileStat(await inspectContainerPath(container, path));
	const archive = await getContainerArchive(container, path);
	const stat = requireArchiveStat(archive);
	ensureFileStat(stat);
	const size = stat.size;

	if (size > MAX_FILE_PREVIEW_BYTES) {
		return { kind: "too_large", size };
	}

	const content = await readFirstArchiveFile(archive, MAX_FILE_PREVIEW_BYTES);
	if (content.length > MAX_FILE_PREVIEW_BYTES) {
		return { kind: "too_large", size: content.length };
	}
	if (!isText(content)) {
		return { kind: "binary", size: content.length };
	}

	return {
		kind: "text",
		content: new TextDecoder("utf-8", { fatal: true }).decode(content),
		size: content.length,
		encoding: "utf-8",
	};
};

export const getContainerFileDownload = async (
	container: DockerContainer,
	inputPath: string,
): Promise<{
	archive: Readable;
	path: string;
	fileName: string;
}> => {
	const path = normalizeContainerPath(inputPath);
	ensureFileStat(await inspectContainerPath(container, path));
	const archive = await getContainerArchive(container, path);
	const stat = requireArchiveStat(archive);
	ensureFileStat(stat);

	return {
		archive: asReadable(archive),
		path,
		fileName: posix.basename(path),
	};
};

export const pipeContainerFileArchive = async (
	archive: Readable,
	destination: Writable,
	maxBytes = MAX_FILE_DOWNLOAD_BYTES,
): Promise<void> => {
	const extractor = extract();
	let found = false;
	let streamedBytes = 0;

	const completed = new Promise<void>((resolve, reject) => {
		const fail = (error: Error) => {
			asReadable(archive).destroy(error);
			extractor.destroy(error);
			reject(error);
		};

		extractor.on(
			"entry",
			(header: TarHeader, entry: Readable, next: () => void) => {
				if (found || entryTypeFromTarHeader(header) !== "file") {
					entry.resume();
					entry.once("end", next);
					entry.once("error", fail);
					return;
				}

				found = true;
				const limiter = new Transform({
					transform(chunk, _encoding, callback) {
						const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
						if (streamedBytes + buffer.length > maxBytes) {
							callback(
								new ContainerFilesystemError(
									"FILE_TOO_LARGE",
									`Files larger than ${maxBytes} bytes cannot be downloaded.`,
								),
							);
							return;
						}

						streamedBytes += buffer.length;
						callback(null, buffer);
					},
				});
				limiter.once("error", (error) => {
					entry.destroy(error);
					fail(error);
				});
				entry.once("error", fail);
				limiter.once("end", next);
				entry.pipe(limiter).pipe(destination, { end: false });
			},
		);
		extractor.once("finish", () => {
			if (!found) {
				reject(
					new ContainerFilesystemError(
						"NOT_A_FILE",
						"The selected path does not contain a regular file.",
					),
				);
				return;
			}
			resolve();
		});
		extractor.once("error", reject);
	});

	const source = asReadable(archive);
	source.once("error", (error) => extractor.destroy(error));
	source.pipe(extractor);
	await completed;
};
