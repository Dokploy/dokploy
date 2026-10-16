import { readdir, rm, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { server } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { cleanupExpiredExports } from "./export-job";
import { cleanupExpiredImports } from "./import-job";
import { getExportJob, getImportJob } from "./jobs";
import { escapeShellArg, remove, run } from "./remote-fs";
import { BUNDLE_EXTENSION } from "./types";

const SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const ORPHAN_AGE_MS = 60 * 60 * 1000;

const hasLiveJob = (entry: string): boolean => {
	const id = entry.endsWith(BUNDLE_EXTENSION)
		? entry.slice(0, -BUNDLE_EXTENSION.length)
		: entry;
	return !!(getExportJob(id) || getImportJob(id));
};

export const sweepOrphanedTransferDirectories = async (
	pathsFn: typeof paths = paths,
	now: number = Date.now(),
): Promise<void> => {
	const { PROJECT_EXPORT_IMPORT_PATH } = pathsFn();
	let entries: string[];
	try {
		entries = await readdir(PROJECT_EXPORT_IMPORT_PATH);
	} catch {
		return;
	}
	for (const entry of entries) {
		if (hasLiveJob(entry)) continue;
		const entryPath = join(PROJECT_EXPORT_IMPORT_PATH, entry);
		try {
			const { mtimeMs } = await stat(entryPath);
			if (now - mtimeMs < ORPHAN_AGE_MS) continue;
		} catch {
			continue;
		}
		await rm(entryPath, { recursive: true, force: true }).catch((error) => {
			console.error(
				`Failed to remove orphaned export/import directory ${entry}:`,
				error,
			);
		});
	}
};

export const sweepRemoteTransferDirectories = async (
	serverIds: string[],
	bootedAt: number,
	pathsFn: typeof paths = paths,
): Promise<void> => {
	const root = pathsFn(true).PROJECT_EXPORT_IMPORT_PATH;
	const bootEpoch = Math.floor(bootedAt / 1000);
	for (const serverId of serverIds) {
		try {
			// Uploads only register their job once they finish, so anything touched
			// after boot may still be in flight.
			const { stdout } = await run(
				serverId,
				`find ${escapeShellArg(root)} -mindepth 1 -maxdepth 1 ! -newermt @${bootEpoch} 2>/dev/null || true`,
			);
			for (const entryPath of stdout.split("\n").filter(Boolean)) {
				const entry = basename(entryPath);
				if (hasLiveJob(entry)) continue;
				await remove({ serverId, path: join(root, entry) });
			}
		} catch (error) {
			console.error(
				`Failed to sweep export/import directories on server ${serverId}:`,
				error,
			);
		}
	}
};

// Job state is in memory, so after a restart nothing else knows about the
// workspaces left on remote servers; one pass at boot is enough.
const sweepRemoteServersOnBoot = async (bootedAt: number): Promise<void> => {
	const servers = await db.query.server.findMany({
		where: eq(server.serverStatus, "active"),
		columns: { serverId: true },
	});
	await sweepRemoteTransferDirectories(
		servers.map((s) => s.serverId),
		bootedAt,
	);
};

export const initProjectExportImportCleanup = (): void => {
	const sweep = () => {
		cleanupExpiredExports().catch((error) => {
			console.error("Failed to clean up expired export jobs:", error);
		});
		cleanupExpiredImports().catch((error) => {
			console.error("Failed to clean up expired import jobs:", error);
		});
		sweepOrphanedTransferDirectories().catch((error) => {
			console.error(
				"Failed to sweep orphaned export/import directories:",
				error,
			);
		});
	};
	sweep();
	setInterval(sweep, SWEEP_INTERVAL_MS).unref();
	sweepRemoteServersOnBoot(Date.now()).catch((error) => {
		console.error("Failed to sweep remote export/import directories:", error);
	});
};
