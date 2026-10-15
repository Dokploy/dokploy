import { createReadStream, createWriteStream, existsSync } from "node:fs";
import {
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import type { SerializeInput } from "@dokploy/server/services/project-export-import";
import {
	deriveKeys,
	gcmDecryptStream,
	serialize,
} from "@dokploy/server/services/project-export-import";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const local = (path: string) => ({ serverId: null, path });

const PASSPHRASE = "correct-horse-battery-staple";

let workDir: string;
let outDir: string;

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "transfer-serialize-work-"));
	outDir = await mkdtemp(join(tmpdir(), "transfer-serialize-out-"));
});

afterEach(async () => {
	await rm(workDir, { recursive: true, force: true });
	await rm(outDir, { recursive: true, force: true });
});

const baseInput: SerializeInput = {
	resources: {
		project: { projectId: "project-1", name: "my-project" },
		environments: [{ environmentId: "env-1", name: "production" }],
		services: [
			{
				kind: "postgres",
				postgresId: "pg-1",
				name: "pg-1",
				databasePassword: "$secret:11111111-1111-1111-1111-111111111111",
			},
		],
		shared: {},
	},
	inventory: {
		project: { name: "my-project", environments: 1 },
		environments: [
			{ id: "env-1", name: "production", services: { postgres: 1 } },
		],
		totals: { postgres: 1 },
		estimatedDumpBytes: 0,
		estimatedFilesBytes: 0,
		images: [],
	},
	requirements: [],
	warnings: [],
	dumps: [
		{
			serviceId: "pg-1",
			serviceType: "postgres",
			mode: "embed",
			ext: "sql.gz",
			path: "dumps/pg-1.sql.gz",
			bytes: 15,
		},
	],
	scope: {
		includeEnvSecrets: true,
		shared: {},
		files: {
			applicationSources: true,
			composeFiles: true,
			traefikRaw: true,
			customCertificates: true,
		},
		dumps: { mode: "none" },
		includeBackupSchedules: true,
	},
	organizationId: "org-1",
	dokployVersion: "1.0.0-test",
	exportedBy: { userId: "user-1", email: "a@b.com" },
};

const secretsPlain = new Map([
	["11111111-1111-1111-1111-111111111111", "realdbpassword"],
]);

describe("serialize", () => {
	it("keeps only the public files in clear and encrypts everything else", async () => {
		await mkdir(join(workDir, "dumps"), { recursive: true });
		await writeFile(join(workDir, "dumps", "pg-1.sql.gz"), "fake-dump-bytes");

		const bundlePath = join(outDir, "bundle.dokploy.tar.gz");
		await serialize(
			baseInput,
			secretsPlain,
			PASSPHRASE,
			local(workDir),
			local(bundlePath),
		);

		expect(existsSync(bundlePath)).toBe(true);
		expect(existsSync(workDir)).toBe(false);

		const { stdout: members } = await execAsync(`tar -tzf "${bundlePath}"`);
		expect(members.split("\n")[0]).toBe("manifest.json");

		const extractDir = join(outDir, "extracted");
		await mkdir(extractDir, { recursive: true });
		await execAsync(`tar -xzf "${bundlePath}" -C "${extractDir}"`);
		expect((await readdir(extractDir)).sort()).toEqual([
			"inventory.json",
			"manifest.json",
			"payload.enc",
			"requirements.json",
			"warnings.json",
		]);
		const outerBytes = await readFile(join(extractDir, "payload.enc"));
		expect(outerBytes.includes("realdbpassword")).toBe(false);
		expect(outerBytes.includes("fake-dump-bytes")).toBe(false);

		const manifest = JSON.parse(
			await readFile(join(extractDir, "manifest.json"), "utf8"),
		);
		const { kEnc } = await deriveKeys(PASSPHRASE, manifest.crypto.salt);
		const payloadDir = join(outDir, "payload");
		await mkdir(payloadDir, { recursive: true });
		await pipeline(
			createReadStream(join(extractDir, "payload.enc")),
			gcmDecryptStream(kEnc),
			createWriteStream(join(outDir, "payload.tar.gz")),
		);
		await execAsync(
			`tar -xzf "${join(outDir, "payload.tar.gz")}" -C "${payloadDir}"`,
		);

		const servicesJson = await readFile(
			join(payloadDir, "resources", "services.json"),
			"utf8",
		);
		expect(servicesJson).not.toContain("realdbpassword");
		expect(servicesJson).toContain(
			"$secret:11111111-1111-1111-1111-111111111111",
		);
		expect(
			await readFile(join(payloadDir, "dumps", "pg-1.sql.gz"), "utf8"),
		).toBe("fake-dump-bytes");
		const secrets = JSON.parse(
			await readFile(join(payloadDir, "secrets.json"), "utf8"),
		);
		expect(secrets["11111111-1111-1111-1111-111111111111"]).toBe(
			"realdbpassword",
		);
	});

	it("removes workDir even when writing fails", async () => {
		const bundlePath = join(outDir, "bundle.dokploy.tar.gz");
		const badInput: SerializeInput = {
			...baseInput,
			resources: {
				...baseInput.resources,
				project: { self: undefined as unknown },
			},
		};
		(badInput.resources.project as Record<string, unknown>).self =
			badInput.resources.project;

		await expect(
			serialize(
				badInput,
				secretsPlain,
				PASSPHRASE,
				local(workDir),
				local(bundlePath),
			),
		).rejects.toThrow();
		expect(existsSync(workDir)).toBe(false);
	});
});
