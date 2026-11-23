import fs from "node:fs";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";

// Traefik doesn't watch subdirectories; an mtime bump forces a reload
export const reloadTraefikDynamicConfig = () => {
	try {
		const { DYNAMIC_TRAEFIK_PATH } = paths();
		const now = new Date();
		fs.utimesSync(DYNAMIC_TRAEFIK_PATH, now, now);
	} catch (error) {
		console.error("Failed to trigger a Traefik dynamic config reload:", error);
	}
};

export const getRemoteTraefikReloadCommand = (dynamicDir: string) =>
	`{ touch -c -- ${quote([dynamicDir])} || true; }`;
