import { readdirSync } from "node:fs";
import { join } from "node:path";
import { docker } from "@/server/constants";
import { getServiceContainer } from "@/server/utils/docker/utils";
import packageInfo from "../../../package.json";

const updateIsAvailable = async () => {
	try {
		const service = await getServiceContainer("dokploy");

		const localImage = await docker.getImage(getDokployImage()).inspect();
		return localImage.Id !== service?.ImageID;
	} catch (error) {
		return false;
	}
};

export const getDokployImage = () => {
	return `dokploy/dokploy:${process.env.RELEASE_TAG || "latest"}`;
};

export const pullLatestRelease = async () => {
	try {
		const stream = await docker.pull(getDokployImage(), {});
		await new Promise((resolve, reject) => {
			docker.modem.followProgress(stream, (err, res) =>
				err ? reject(err) : resolve(res),
			);
		});
		const newUpdateIsAvailable = await updateIsAvailable();
		return newUpdateIsAvailable;
	} catch (error) {}

	return false;
};
export const getDokployVersion = () => {
	return packageInfo.version;
};

interface TreeDataItem {
	id: string;
	name: string;
	type: "file" | "directory";
	children?: TreeDataItem[];
}

export const readDirectory = (dirPath: string): TreeDataItem[] => {
	const items = readdirSync(dirPath, { withFileTypes: true });
	return items.map((item) => {
		const fullPath = join(dirPath, item.name);
		if (item.isDirectory()) {
			return {
				id: fullPath,
				name: item.name,
				type: "directory",
				children: readDirectory(fullPath),
			};
		}
		return {
			id: fullPath,
			name: item.name,
			type: "file",
		};
	});
};
