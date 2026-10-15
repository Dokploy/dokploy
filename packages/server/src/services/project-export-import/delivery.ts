import type { Destination } from "@dokploy/server/services/destination";
import { getS3Credentials } from "@dokploy/server/utils/backups/utils";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { openProcessStream } from "@dokploy/server/utils/process/remoteStream";
import { quote } from "shell-quote";
import slug from "slugify";
import { deriveKeys, verifyKeyCheck } from "./crypto";
import { type Location, run } from "./remote-fs";
import { BUNDLE_EXTENSION, type Manifest, manifestSchema } from "./types";

export const EXPORTS_DIRECTORY = "dokploy-export-import";

const MANIFEST_PROBE_BYTES = 4 * 1024 * 1024;
const RCLONE_FLAGS = "--contimeout 30s --retries 1 --low-level-retries 3";

export const slugifyProjectName = (name: string): string =>
	slug(name, { lower: true, trim: true, strict: true }) || "project";

export const buildBundleObjectKey = (
	projectSlug: string,
	exportedAt: string,
): string =>
	`${EXPORTS_DIRECTORY}/${projectSlug}-${exportedAt.replace(/[:.]/g, "-")}${BUNDLE_EXTENSION}`;

const objectPath = (destination: Destination, key: string) =>
	`:s3:${destination.bucket}/${key}`;

export const uploadBundleToDestination = async (
	destination: Destination,
	bundle: Location,
	key: string,
): Promise<void> => {
	const flags = getS3Credentials(destination);
	await run(
		bundle.serverId,
		`rclone copyto ${RCLONE_FLAGS} ${flags.join(" ")} ${quote([bundle.path])} ${quote([objectPath(destination, key)])}`,
	);
};

export const downloadBundleFromDestination = async (
	destination: Destination,
	key: string,
	bundle: Location,
): Promise<void> => {
	const flags = getS3Credentials(destination);
	await run(
		bundle.serverId,
		`rclone copyto ${RCLONE_FLAGS} ${flags.join(" ")} ${quote([objectPath(destination, key)])} ${quote([bundle.path])}`,
	);
};

export const deleteBundleFromDestination = async (
	destination: Destination,
	key: string,
): Promise<void> => {
	const flags = getS3Credentials(destination);
	await execAsync(
		`rclone deletefile ${RCLONE_FLAGS} ${flags.join(" ")} ${quote([objectPath(destination, key)])}`,
	);
};

export const streamBundleFromDestination = (
	destination: Destination,
	key: string,
) => {
	const flags = getS3Credentials(destination);
	return openProcessStream(
		null,
		`rclone cat ${RCLONE_FLAGS} ${flags.join(" ")} ${quote([objectPath(destination, key)])}`,
	);
};

export type RemoteBundleInfo = { key: string; size: number; modTime: string };

export const listBundles = async (
	destination: Destination,
): Promise<RemoteBundleInfo[]> => {
	const flags = getS3Credentials(destination);
	const { stdout } = await execAsync(
		`rclone lsjson ${RCLONE_FLAGS} ${flags.join(" ")} ${quote([objectPath(destination, EXPORTS_DIRECTORY)])}`,
	).catch((error: { stderr?: string }) => {
		if (error.stderr?.includes("directory not found")) return { stdout: "[]" };
		throw error;
	});
	const entries = JSON.parse(stdout) as Array<{
		Path: string;
		Size: number;
		ModTime: string;
		IsDir: boolean;
	}>;
	return entries
		.filter((entry) => !entry.IsDir && entry.Path.endsWith(BUNDLE_EXTENSION))
		.map((entry) => ({
			key: `${EXPORTS_DIRECTORY}/${entry.Path}`,
			size: entry.Size,
			modTime: entry.ModTime,
		}))
		.sort((a, b) => b.modTime.localeCompare(a.modTime));
};

const readRemoteManifest = async (
	destination: Destination,
	key: string,
): Promise<Manifest | undefined> => {
	const flags = getS3Credentials(destination);
	const { stdout } = await execAsync(
		`rclone cat ${RCLONE_FLAGS} ${flags.join(" ")} --count ${MANIFEST_PROBE_BYTES} ${quote([objectPath(destination, key)])} | tar -xzOf - manifest.json 2>/dev/null || true`,
		{ shell: "/bin/bash" },
	);
	if (!stdout.trim()) return undefined;
	const parsed = manifestSchema.safeParse(JSON.parse(stdout));
	return parsed.success ? parsed.data : undefined;
};

export const verifyBundlePassphrase = async (
	destination: Destination,
	key: string,
	passphrase: string,
): Promise<{ checked: boolean; valid: boolean; exportedAt?: string }> => {
	const manifest = await readRemoteManifest(destination, key);
	if (!manifest) return { checked: false, valid: false };
	const { kEnc } = await deriveKeys(passphrase, manifest.crypto.salt);
	return {
		checked: true,
		valid: verifyKeyCheck(kEnc, manifest.crypto.keyCheck),
		exportedAt: manifest.exportedAt,
	};
};
