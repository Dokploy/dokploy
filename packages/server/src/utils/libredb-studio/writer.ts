import { randomBytes } from "node:crypto";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";
import { execAsyncRemote, writeFileRemote } from "../process/execAsync";
import { LIBREDB_STUDIO_SEED_FILE } from "./constants";

export interface StudioSeedPaths {
	parentDir: string;
	seedDir: string;
	seedFile: string;
}

export const getStudioSeedPaths = (
	appName: string,
	serverId: string | null,
): StudioSeedPaths => {
	const { APPLICATIONS_PATH } = paths(!!serverId);
	const parentDir = path.join(APPLICATIONS_PATH, appName, "libredb-studio");
	const seedDir = path.join(parentDir, "seed");
	return {
		parentDir,
		seedDir,
		seedFile: path.join(seedDir, LIBREDB_STUDIO_SEED_FILE),
	};
};

// Studio reads only the named seed file, so a dot-prefixed sibling is never
// picked up half-written.
const temporarySeedFile = (seedDir: string) =>
	path.join(
		seedDir,
		`.${LIBREDB_STUDIO_SEED_FILE}.${randomBytes(8).toString("hex")}.tmp`,
	);

// The 0700 parent keeps other host users away from the passwords, while the
// container only sees the bind-mounted 0755 seed directory and reads the 0644
// file as its own uid, so no chown (and no root) is needed.
const ensureLocalDirectories = async ({
	parentDir,
	seedDir,
}: StudioSeedPaths) => {
	await mkdir(seedDir, { recursive: true });
	await chmod(parentDir, 0o700);
	await chmod(seedDir, 0o755);
};

const writeLocalSeed = async (seedPaths: StudioSeedPaths, content: string) => {
	await ensureLocalDirectories(seedPaths);
	if (content === "") {
		await rm(seedPaths.seedFile, { force: true });
		return;
	}
	const temporaryFile = temporarySeedFile(seedPaths.seedDir);
	try {
		await writeFile(temporaryFile, content, { mode: 0o644, flag: "wx" });
		await chmod(temporaryFile, 0o644);
		// The directory is bind-mounted, not the file, so the running container
		// sees the new inode after the rename.
		await rename(temporaryFile, seedPaths.seedFile);
	} catch (error) {
		await rm(temporaryFile, { force: true });
		throw error;
	}
};

const writeRemoteSeed = async (
	serverId: string,
	{ parentDir, seedDir, seedFile }: StudioSeedPaths,
	content: string,
) => {
	const ensureDirectories = `mkdir -p ${quote([seedDir])} && chmod 700 ${quote([parentDir])} && chmod 755 ${quote([seedDir])}`;
	if (content === "") {
		await execAsyncRemote(
			serverId,
			`${ensureDirectories} && rm -f ${quote([seedFile])}`,
		);
		return;
	}
	await execAsyncRemote(serverId, ensureDirectories);
	const temporaryFile = temporarySeedFile(seedDir);
	try {
		// SFTP carries the content, so it never becomes a shell argument and the
		// argument-size limit of the echo | base64 approach does not apply.
		await writeFileRemote(serverId, temporaryFile, content);
		await execAsyncRemote(
			serverId,
			`chmod 644 ${quote([temporaryFile])} && mv -f ${quote([temporaryFile])} ${quote([seedFile])}`,
		);
	} catch (error) {
		try {
			await execAsyncRemote(serverId, `rm -f ${quote([temporaryFile])}`);
		} catch (cleanupError) {
			// The cleanup fails for the same reason as the write when SSH is down,
			// so the write failure stays the message and cause that lastSyncError
			// records.
			throw new AggregateError(
				[error, cleanupError],
				error instanceof Error ? error.message : String(error),
				{ cause: error },
			);
		}
		throw error;
	}
};

export const writeStudioSeed = async ({
	appName,
	serverId,
	content,
}: {
	appName: string;
	serverId: string | null;
	content: string;
}): Promise<void> => {
	const seedPaths = getStudioSeedPaths(appName, serverId);
	if (serverId) {
		await writeRemoteSeed(serverId, seedPaths, content);
		return;
	}
	await writeLocalSeed(seedPaths, content);
};

export const removeStudioSeedDirectory = async ({
	appName,
	serverId,
}: {
	appName: string;
	serverId: string | null;
}): Promise<void> => {
	const { parentDir } = getStudioSeedPaths(appName, serverId);
	if (serverId) {
		await execAsyncRemote(serverId, `rm -rf ${quote([parentDir])}`);
		return;
	}
	await rm(parentDir, { recursive: true, force: true });
};
