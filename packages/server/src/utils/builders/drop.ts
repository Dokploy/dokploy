import fs from "node:fs/promises";
import path, { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Application } from "@dokploy/server/services/application";
import { findServerById } from "@dokploy/server/services/server";
import { readValidDirectory } from "@dokploy/server/wss/utils";
import AdmZip from "adm-zip";
import { Client, type SFTPWrapper } from "ssh2";
import {
	recreateDirectory,
	recreateDirectoryRemote,
} from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";

const MAX_DROP_ARCHIVE_BYTES = 256 * 1024 * 1024;
const MAX_DROP_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_DROP_TOTAL_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;
const MAX_DROP_ENTRY_COUNT = 10_000;
const MAX_DROP_COMPRESSION_RATIO = 200;

export const assertDropArchiveLimits = (
	archiveBytes: number,
	entries: AdmZip.IZipEntry[],
) => {
	if (archiveBytes > MAX_DROP_ARCHIVE_BYTES) {
		throw new Error("ZIP archive exceeds the 256 MiB upload limit");
	}
	if (entries.length > MAX_DROP_ENTRY_COUNT) {
		throw new Error("ZIP archive contains too many entries");
	}

	let totalUncompressedBytes = 0;
	for (const entry of entries) {
		if (entry.isDirectory) continue;
		const uncompressedBytes = entry.header.size;
		const compressedBytes = entry.header.compressedSize;
		if (
			!Number.isSafeInteger(uncompressedBytes) ||
			!Number.isSafeInteger(compressedBytes) ||
			uncompressedBytes < 0 ||
			compressedBytes < 0
		) {
			throw new Error("ZIP archive contains invalid entry sizes");
		}
		if (uncompressedBytes > MAX_DROP_ENTRY_BYTES) {
			throw new Error("ZIP archive entry exceeds the 256 MiB limit");
		}
		if (
			compressedBytes === 0
				? uncompressedBytes > 0
				: uncompressedBytes / compressedBytes > MAX_DROP_COMPRESSION_RATIO
		) {
			throw new Error("ZIP archive entry exceeds the compression ratio limit");
		}
		totalUncompressedBytes += uncompressedBytes;
		if (totalUncompressedBytes > MAX_DROP_TOTAL_UNCOMPRESSED_BYTES) {
			throw new Error("ZIP archive exceeds the 1 GiB expanded-size limit");
		}
	}
};

export const unzipDrop = async (zipFile: File, application: Application) => {
	let sftp: SFTPWrapper | null = null;

	try {
		// Reject oversized uploads before copying or parsing attacker-controlled data.
		assertDropArchiveLimits(zipFile.size, []);
		const { appName } = application;
		// Use buildServerId if set, otherwise fall back to serverId
		// This ensures the code is extracted to the server where the build will run
		const targetServerId = application.buildServerId || application.serverId;
		const { APPLICATIONS_PATH } = paths(!!targetServerId);
		const outputPath = join(APPLICATIONS_PATH, appName, "code");
		if (targetServerId) {
			await recreateDirectoryRemote(outputPath, targetServerId);
		} else {
			await recreateDirectory(outputPath);
		}
		const arrayBuffer = await zipFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const zip = new AdmZip(buffer);
		const zipEntries = zip
			.getEntries()
			.filter((entry) => !entry.entryName.startsWith("__MACOSX"));
		assertDropArchiveLimits(zipFile.size, zipEntries);

		const rootEntries = zipEntries.filter(
			(entry) =>
				entry.entryName.split("/").length === 1 ||
				(entry.entryName.split("/").length === 2 &&
					entry.entryName.endsWith("/")),
		);

		const hasSingleRootFolder = !!(
			rootEntries.length === 1 && rootEntries[0]?.isDirectory
		);
		const rootFolderName = hasSingleRootFolder
			? rootEntries[0]?.entryName.split("/")[0]
			: "";

		const resolvedOutputPath = path.resolve(outputPath);
		if (targetServerId) {
			sftp = await getSFTPConnection(targetServerId);
		}
		for (const entry of zipEntries) {
			let filePath = entry.entryName;

			if (
				hasSingleRootFolder &&
				rootFolderName &&
				filePath.startsWith(`${rootFolderName}/`)
			) {
				filePath = filePath.slice(rootFolderName?.length + 1);
			}

			if (!filePath) continue;

			const resolvedEntryPath = path.resolve(outputPath, filePath);
			if (
				resolvedEntryPath !== resolvedOutputPath &&
				!resolvedEntryPath.startsWith(`${resolvedOutputPath}${path.sep}`)
			) {
				throw new Error(
					`Path traversal detected: resolved path escapes output directory: ${filePath}`,
				);
			}
			const fullPath = resolvedEntryPath.replace(/\\/g, "/");
			if (!readValidDirectory(fullPath, targetServerId)) {
				throw new Error(`Invalid ZIP entry path: ${filePath}`);
			}

			if (isDangerousNode(entry)) {
				throw new Error(
					`Dangerous node entries are not allowed: ${entry.entryName}`,
				);
			}

			if (targetServerId) {
				if (!entry.isDirectory) {
					if (sftp === null) throw new Error("No SFTP connection available");
					try {
						const dirPath = path.dirname(fullPath);
						await execAsyncRemote(targetServerId, `mkdir -p "${dirPath}"`);
						await uploadFileToServer(sftp, entry.getData(), fullPath);
					} catch (err) {
						console.error(`Error uploading file ${fullPath}:`, err);
						throw err;
					}
				}
			} else {
				if (entry.isDirectory) {
					await fs.mkdir(fullPath, { recursive: true });
				} else {
					await fs.mkdir(path.dirname(fullPath), { recursive: true });
					await fs.writeFile(fullPath, entry.getData());
				}
			}
		}
	} catch (error) {
		console.error("Error processing ZIP file:", error);
		throw error;
	} finally {
		sftp?.end();
	}
};

const getSFTPConnection = async (serverId: string): Promise<SFTPWrapper> => {
	const server = await findServerById(serverId);
	if (!server.sshKeyId) throw new Error("No SSH key available for this server");

	return new Promise((resolve, reject) => {
		const conn = new Client();
		conn
			.on("ready", () => {
				conn.sftp((err, sftp) => {
					if (err) return reject(err);
					resolve(sftp);
				});
			})
			.connect({
				host: server.ipAddress,
				port: server.port,
				username: server.username,
				privateKey: server.sshKey?.privateKey,
			});
	});
};

const uploadFileToServer = (
	sftp: SFTPWrapper,
	data: Buffer,
	remotePath: string,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		sftp.writeFile(remotePath, data, (err) => {
			if (err) {
				console.error(`SFTP write error for ${remotePath}:`, err);
				return reject(err);
			}
			resolve();
		});
	});
};

function isDangerousNode(entry: AdmZip.IZipEntry) {
	const type = (entry.header.attr >> 16) & 0o170000;

	return (
		type === 0o120000 || // symlink
		type === 0o060000 || // block device
		type === 0o020000 || // char device
		type === 0o010000 // fifo/pipe
	);
}
