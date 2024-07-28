import fs from "node:fs/promises";
import path, { join } from "node:path";
import { APPLICATIONS_PATH } from "@dokploy/server/constants";
import AdmZip from "adm-zip";
import { recreateDirectory } from "../filesystem/directory";

export const unzipDrop = async (zipFile: File, appName: string) => {
	try {
		const outputPath = join(APPLICATIONS_PATH, appName, "code");
		await recreateDirectory(outputPath);
		const arrayBuffer = await zipFile.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		const zip = new AdmZip(buffer);
		const zipEntries = zip.getEntries();

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

			const fullPath = path.join(outputPath, filePath);
			if (entry.isDirectory) {
				await fs.mkdir(fullPath, { recursive: true });
			} else {
				await fs.mkdir(path.dirname(fullPath), { recursive: true });
				await fs.writeFile(fullPath, entry.getData());
			}
		}
	} catch (error) {
		console.error("Error processing ZIP file:", error);
		throw error;
	}
};
