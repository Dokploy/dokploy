import { basename, resolve } from "node:path";
import { paths } from "@dokploy/server/constants";
import { getWebServerProvider } from "@dokploy/server/services/web-server-settings";
import { TRPCError } from "@trpc/server";
import { quote } from "shell-quote";
import { readConfigInPath } from "../traefik/application";
import {
	applyCaddy,
	caddySwitch,
	runOn,
	withCaddyQueue,
	writeOn,
} from "./sync";

// The admin's side of Caddy's folder. data/ and config/ next to it hold
// private keys and must never be listed, read or written through the browser.
const EDITABLE = /^(Caddyfile|(global|sites)\/[\w.-]+\.caddy)$/;

const refuse = (message: string) =>
	new TRPCError({ code: "BAD_REQUEST", message });

// Resolved first, so that a relative path or one with dots in it cannot name
// a file in Caddy's folder without being recognised as one.
const nameInCaddyFolder = (file: string, serverId?: string | null) => {
	const root = `${paths(!!serverId).MAIN_CADDY_PATH}/`;
	const resolved = resolve(file);
	return resolved.startsWith(root) ? resolved.slice(root.length) : null;
};

export const isCaddyPath = (file: string, serverId?: string | null) =>
	nameInCaddyFolder(file, serverId) !== null;

/**
 * The full path of a file inside Caddy's folder that the file browser may
 * open. Anything else under that folder is refused, whatever the path looks
 * like.
 */
export const caddyFilePath = (file: string, serverId?: string | null) => {
	const name = nameInCaddyFolder(file, serverId);
	if (name === null || !EDITABLE.test(name)) {
		throw refuse(
			"Only the Caddyfile and the files in global/ and sites/ can be opened here",
		);
	}
	return `${paths(!!serverId).MAIN_CADDY_PATH}/${name}`;
};

export const listCaddyFiles = async (serverId?: string | null) => {
	const root = paths(!!serverId).MAIN_CADDY_PATH;
	const { stdout } = await runOn(
		serverId,
		`cd ${quote([root])} && ls -1 global/*.caddy sites/*.caddy 2>/dev/null; true`,
	);
	const names = stdout.split("\n").filter((name) => EDITABLE.test(name));
	const file = (name: string) => ({
		id: `${root}/${name}`,
		name: basename(name),
		type: "file" as const,
	});
	return [
		file("Caddyfile"),
		...["global", "sites"].map((folder) => ({
			id: `${root}/${folder}`,
			name: folder,
			type: "directory" as const,
			children: names.filter((name) => name.startsWith(`${folder}/`)).map(file),
		})),
	];
};

/**
 * Saves one of the admin's files and has Caddy load it. If Caddy rejects the
 * result, the previous content is put back, so that nobody can leave a file
 * behind that blocks every later configuration change on the server.
 */
export const saveCaddyFile = async (
	file: string,
	content: string,
	serverId?: string | null,
) => {
	const target = caddyFilePath(file, serverId);
	if (target === `${paths(!!serverId).MAIN_CADDY_PATH}/Caddyfile`) {
		throw refuse(
			"Dokploy regenerates the Caddyfile on every change. Your own configuration goes in global/ and sites/",
		);
	}
	if ((await getWebServerProvider(serverId)) !== "caddy") {
		throw refuse("This server runs Traefik, so Caddy's files are not in use");
	}
	// The switch holds the queue for minutes, and may leave no Caddy to ask.
	if (caddySwitch(serverId)?.status === "running") {
		throw refuse(
			"A switch is running on this server. Save again when it is done",
		);
	}
	// In the queue, so that no sync and no other save runs between the write
	// and Caddy's answer.
	await withCaddyQueue(serverId, async () => {
		const previous = await readConfigInPath(target, serverId ?? undefined);
		await writeOn(serverId, target, content);
		try {
			await applyCaddy(serverId, true);
		} catch (error) {
			await writeOn(serverId, target, previous ?? "");
			throw refuse(
				`Caddy did not accept this file, so the previous version was kept. ${error instanceof Error ? error.message : String(error)}`,
			);
		}
	});
};
