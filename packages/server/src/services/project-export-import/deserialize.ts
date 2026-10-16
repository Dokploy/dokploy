import {
	deriveKeys,
	gcmDecryptStream,
	TransferCryptoError,
	verifyKeyCheck,
} from "./crypto";
import { migrateManifest } from "./migrations";
import {
	at,
	escapeShellArg,
	fileSize,
	type Location,
	pipeThrough,
	readFile,
	remove,
	run,
} from "./remote-fs";
import { PAYLOAD_FILE } from "./serialize";
import type {
	Inventory,
	Manifest,
	Requirement,
	Snapshot,
	Warning,
} from "./types";
import { manifestSchema, snapshotSchema } from "./types";

const DEFAULT_MAX_DECOMPRESSED_BYTES = 20 * 1024 * 1024 * 1024;

export const isUnsafeBundlePath = (value: string): boolean =>
	value.startsWith("/") || value.split("/").includes("..");

export const assertSafeBundlePath = (value: string, label: string): void => {
	if (isUnsafeBundlePath(value)) {
		throw new Error(`Unsafe path in bundle: "${label}"`);
	}
};

const assertSafeTarEntries = async (archive: Location) => {
	const { stdout } = await run(
		archive.serverId,
		`tar -tzf ${escapeShellArg(archive.path)} | grep -E '^/|(^|/)\\.\\.(/|$)' | head -n 1; true`,
	);
	const unsafe = stdout.trim();
	if (unsafe) {
		throw new Error(`Unsafe path in bundle: "${unsafe}"`);
	}
};

const assertNoUnsafeSymlinks = async (dir: Location): Promise<void> => {
	const { stdout } = await run(
		dir.serverId,
		`cd ${escapeShellArg(dir.path)} && find . -type l -exec sh -c 'printf "%s\\0%s\\0" "$1" "$(readlink "$1")"' _ {} \\;`,
	);
	const parts = stdout.split("\0");
	for (let i = 0; i + 1 < parts.length; i += 2) {
		const link = parts[i] ?? "";
		const target = parts[i + 1] ?? "";
		const resolved = target.startsWith("/")
			? ["..", target]
			: [...link.split("/").slice(0, -1), ...target.split("/")];
		let depth = 0;
		for (const part of resolved) {
			if (part === "..") depth -= 1;
			else if (part && part !== ".") depth += 1;
			if (depth < 0) {
				throw new Error(`Unsafe symlink in bundle: "${link}" -> "${target}"`);
			}
		}
	}
};

const extractedBytes = async (dir: Location): Promise<number> => {
	const { stdout } = await run(
		dir.serverId,
		`du -sk ${escapeShellArg(dir.path)} | cut -f1`,
	);
	return (Number.parseInt(stdout.trim(), 10) || 0) * 1024;
};

// gzip -l wraps at 4GiB, so count the real stream without writing it to disk.
const decompressedSize = async (archive: Location): Promise<number> => {
	const { stdout } = await run(
		archive.serverId,
		`gzip -dc ${escapeShellArg(archive.path)} | wc -c`,
	);
	return Number.parseInt(stdout.trim(), 10) || 0;
};

const extractInto = async (
	archive: Location,
	dir: Location,
	maxBytes: number,
) => {
	await assertSafeTarEntries(archive);
	const size = await fileSize(archive);
	if (size > maxBytes) {
		throw new Error(
			`Bundle size (${size} bytes) exceeds the limit (${maxBytes} bytes)`,
		);
	}
	const decompressed = await decompressedSize(archive);
	if (decompressed > maxBytes) {
		throw new Error(
			`Bundle decompressed size (${decompressed} bytes) exceeds the limit (${maxBytes} bytes)`,
		);
	}
	await run(
		dir.serverId,
		`mkdir -p ${escapeShellArg(dir.path)} && tar -xzf ${escapeShellArg(archive.path)} -C ${escapeShellArg(dir.path)}`,
	);
	try {
		await assertNoUnsafeSymlinks(dir);
		const extracted = await extractedBytes(dir);
		if (extracted > maxBytes) {
			throw new Error(
				`Bundle decompressed size (${extracted} bytes) exceeds the limit (${maxBytes} bytes)`,
			);
		}
	} catch (error) {
		await remove(dir);
		throw error;
	}
};

const readJson = async <T>(workDir: Location, name: string): Promise<T> =>
	JSON.parse((await readFile(at(workDir, name))).toString("utf8"));

const readManifest = async (workDir: Location): Promise<Manifest> =>
	migrateManifest(
		manifestSchema.parse(await readJson(workDir, "manifest.json")),
	);

export type InspectBundleOptions = { maxDecompressedBytes?: number };

export type InspectBundleResult = {
	manifest: Manifest;
	inventory: Inventory;
	requirements: Requirement[];
	warnings: Warning[];
};

export const inspectBundle = async (
	bundle: Location,
	workDir: Location,
	opts: InspectBundleOptions = {},
): Promise<InspectBundleResult> => {
	const maxBytes = opts.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
	await extractInto(bundle, workDir, maxBytes);
	return {
		manifest: await readManifest(workDir),
		inventory: await readJson(workDir, "inventory.json"),
		requirements: await readJson(workDir, "requirements.json"),
		warnings: await readJson(workDir, "warnings.json"),
	};
};

export type UnlockBundleResult = {
	snapshot: Snapshot;
	secretsPlain: Map<string, string>;
};

export const unlockBundle = async (
	workDir: Location,
	passphrase: string,
	opts: InspectBundleOptions = {},
): Promise<UnlockBundleResult> => {
	const maxBytes = opts.maxDecompressedBytes ?? DEFAULT_MAX_DECOMPRESSED_BYTES;
	const manifest = await readManifest(workDir);
	const { kEnc } = await deriveKeys(passphrase, manifest.crypto.salt);
	if (!verifyKeyCheck(kEnc, manifest.crypto.keyCheck)) {
		throw new TransferCryptoError("Incorrect passphrase");
	}

	const payload = at(workDir, "payload.tar.gz");
	try {
		await pipeThrough(
			at(workDir, PAYLOAD_FILE),
			gcmDecryptStream(kEnc),
			payload,
		);
		await extractInto(payload, workDir, maxBytes);
	} finally {
		await remove(payload).catch(() => {});
		await remove(at(workDir, PAYLOAD_FILE)).catch(() => {});
	}

	const secretsPlain = new Map(
		Object.entries(
			await readJson<Record<string, string>>(workDir, "secrets.json"),
		),
	);
	await remove(at(workDir, "secrets.json"));

	const snapshot = snapshotSchema.parse({
		manifest,
		resources: {
			project: await readJson(workDir, "resources/project.json"),
			environments: await readJson(workDir, "resources/environments.json"),
			services: await readJson(workDir, "resources/services.json"),
			shared: await readJson(workDir, "resources/shared.json"),
		},
		requirements: await readJson(workDir, "requirements.json"),
		warnings: await readJson(workDir, "warnings.json"),
		dumps: await readJson(workDir, "dumps.json"),
	});

	return { snapshot, secretsPlain };
};
