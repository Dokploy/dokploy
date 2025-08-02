import fs from "node:fs/promises";
import path, { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import type { Application } from "@dokploy/server/services/application";
import { findServerById } from "@dokploy/server/services/server";
import AdmZip from "adm-zip";
import { Client, type SFTPWrapper } from "ssh2";
import {
	recreateDirectory,
	recreateDirectoryRemote,
} from "../filesystem/directory";
import { execAsyncRemote } from "../process/execAsync";

export const unzipDrop = async (zipFile: File, application: Application) => {
	let sftp: SFTPWrapper | null = null;

	try {
		const { appName } = application;
		const { APPLICATIONS_PATH } = paths(!!application.serverId);
		const outputPath = join(APPLICATIONS_PATH, appName, "code");
		if (application.serverId) {
			await recreateDirectoryRemote(outputPath, application.serverId);
		} else {
			await recreateDirectory(outputPath);
		}
		const arrayBuffer = await zipFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const zip = new AdmZip(buffer);
		const zipEntries = zip
			.getEntries()
			.filter((entry) => !entry.entryName.startsWith("__MACOSX"));

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

		if (application.serverId) {
			sftp = await getSFTPConnection(application.serverId);
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

			const fullPath = path.join(outputPath, filePath).replace(/\\/g, "/");

			if (application.serverId) {
				if (!entry.isDirectory) {
					if (sftp === null) throw new Error("No SFTP connection available");
					try {
						const dirPath = path.dirname(fullPath);
						await execAsyncRemote(
							application.serverId,
							`mkdir -p "${dirPath}"`,
						);
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
