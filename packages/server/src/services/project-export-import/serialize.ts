import { dirname } from "node:path";
import { deriveKeys, gcmEncryptStream, makeKeyCheck } from "./crypto";
import {
	at,
	escapeShellArg,
	type Location,
	pipeThrough,
	run,
	writeFile,
} from "./remote-fs";
import type {
	DumpIndex,
	ExportScope,
	Inventory,
	Manifest,
	Requirement,
	ResourceKind,
	Snapshot,
	SourceInstance,
	Warning,
} from "./types";
import { KDF_PARAMS, TRANSFER_FORMAT, TRANSFER_FORMAT_VERSION } from "./types";

const PUBLIC_BUNDLE_FILES = [
	"manifest.json",
	"inventory.json",
	"requirements.json",
	"warnings.json",
] as const;
export const PAYLOAD_FILE = "payload.enc";

export type SerializeInput = {
	resources: Snapshot["resources"];
	inventory: Inventory;
	requirements: Requirement[];
	warnings: Warning[];
	dumps: DumpIndex[];
	scope: ExportScope;
	organizationId: string;
	dokployVersion: string;
	instanceInfo?: Omit<SourceInstance, "dokployVersion" | "organizationId">;
	exportedBy: { userId: string; email: string };
};

const writeJson = (loc: Location, value: unknown) =>
	writeFile(loc, JSON.stringify(value, null, 2));

export const serialize = async (
	data: SerializeInput,
	secretsPlain: Map<string, string>,
	passphrase: string,
	workDir: Location,
	bundle: Location,
): Promise<void> => {
	const payload = { ...workDir, path: `${workDir.path}.payload.tar.gz` };
	const outer = { ...workDir, path: `${workDir.path}.outer` };
	try {
		const { salt, kEnc } = await deriveKeys(passphrase);

		await writeJson(
			at(workDir, "resources", "project.json"),
			data.resources.project,
		);
		await writeJson(
			at(workDir, "resources", "environments.json"),
			data.resources.environments,
		);
		await writeJson(
			at(workDir, "resources", "services.json"),
			data.resources.services,
		);
		await writeJson(
			at(workDir, "resources", "shared.json"),
			data.resources.shared,
		);
		await writeJson(at(workDir, "inventory.json"), data.inventory);
		await writeJson(at(workDir, "requirements.json"), data.requirements);
		await writeJson(at(workDir, "warnings.json"), data.warnings);
		await writeJson(at(workDir, "dumps.json"), data.dumps);
		await writeJson(
			at(workDir, "secrets.json"),
			Object.fromEntries(secretsPlain),
		);

		const manifest: Manifest = {
			format: TRANSFER_FORMAT,
			formatVersion: TRANSFER_FORMAT_VERSION,
			exportedAt: new Date().toISOString(),
			exportedBy: data.exportedBy,
			sourceInstance: {
				...data.instanceInfo,
				dokployVersion: data.dokployVersion,
				organizationId: data.organizationId,
			},
			scope: data.scope,
			crypto: {
				salt,
				kdfParams: KDF_PARAMS,
				keyCheck: makeKeyCheck(kEnc),
			},
			counts: data.inventory.totals as Partial<Record<ResourceKind, number>>,
		};
		await writeJson(at(workDir, "manifest.json"), manifest);

		const copyPublic = PUBLIC_BUNDLE_FILES.map(
			(file) =>
				`cp ${escapeShellArg(at(workDir, file).path)} ${escapeShellArg(outer.path)}`,
		).join(" && ");
		await run(
			workDir.serverId,
			`tar -czf ${escapeShellArg(payload.path)} -C ${escapeShellArg(workDir.path)} . && mkdir -p ${escapeShellArg(outer.path)} && ${copyPublic}`,
		);
		await pipeThrough(payload, gcmEncryptStream(kEnc), at(outer, PAYLOAD_FILE));
		await run(
			workDir.serverId,
			`mkdir -p ${escapeShellArg(dirname(bundle.path))} && tar -czf ${escapeShellArg(bundle.path)} -C ${escapeShellArg(outer.path)} ${PUBLIC_BUNDLE_FILES.join(" ")} ${PAYLOAD_FILE}`,
		);
	} finally {
		await run(
			workDir.serverId,
			`rm -rf ${escapeShellArg(workDir.path)} ${escapeShellArg(payload.path)} ${escapeShellArg(outer.path)}`,
		).catch(() => {});
	}
};
