import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import type {
	ExportScope,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	capture,
	detectRequirements,
	detectWarnings,
	inspectBundle,
	serialize,
	TransferCryptoError,
	unlockBundle,
} from "@dokploy/server/services/project-export-import";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const local = (path: string) => ({ serverId: null, path });

const PASSPHRASE = "correct-horse-battery-staple";

const application = {
	applicationId: "app-1",
	name: "my-app",
	appName: "my-app-abc123",
	environmentId: "env-1",
	env: "DATABASE_URL=postgres://user:${{vault.prod.DB_PASS}}@db/mydb",
	buildArgs: null,
	buildSecrets: null,
	previewEnv: null,
	serverId: null,
	buildServerId: null,
	githubId: null,
	gitlabId: null,
	giteaId: null,
	bitbucketId: null,
	refreshToken: "webhook-token",
	registryId: null,
	buildRegistryId: null,
	rollbackRegistryId: null,
	customGitSSHKeyId: null,
	customGitSSHKey: null,
	networkIds: [],
	owner: null,
	repository: null,
	sourceType: "docker",
	autoDeploy: false,
	isPreviewDeploymentsActive: false,
	createdAt: "2024-01-01T00:00:00.000Z",
	domains: [],
	mounts: [],
	redirects: [],
	security: [],
	ports: [],
	schedules: [],
	volumeBackups: [],
};

const postgres = {
	postgresId: "pg-1",
	name: "my-db",
	appName: "my-db-xyz789",
	environmentId: "env-1",
	env: "",
	databasePassword: "realdbpassword123",
	serverId: null,
	createdAt: "2024-01-01T00:00:00.000Z",
	mounts: [],
	backups: [],
	volumeBackups: [],
};

const emptyServiceArrays = {
	mysql: [],
	mariadb: [],
	mongo: [],
	redis: [],
	libsql: [],
	compose: [],
};

const projectTree = {
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-1",
	env: "",
	createdAt: "2024-01-01T00:00:00.000Z",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			projectId: "project-1",
			env: "",
			isDefault: true,
			createdAt: "2024-01-01T00:00:00.000Z",
			applications: [application],
			postgres: [postgres],
			...emptyServiceArrays,
		},
	],
};

const fakeDb = (): TransferDb =>
	({
		query: {
			projects: { findFirst: async () => projectTree },
			environments: { findFirst: async () => undefined },
			applications: { findMany: async () => [application] },
			schedules: { findMany: async () => [] },
			volumeBackups: { findMany: async () => [] },
			vaultProvider: { findMany: async () => [] },
			registry: { findMany: async () => [], findFirst: async () => undefined },
			destinations: { findMany: async () => [] },
			network: { findMany: async () => [] },
			certificates: { findMany: async () => [] },
		},
	}) as any as TransferDb;

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: false,
		composeFiles: false,
		traefikRaw: false,
		customCertificates: false,
	},
	dumps: { mode: "none" },
	includeBackupSchedules: true,
};

const ustarHeader = (name: string, size: number): Buffer => {
	const header = Buffer.alloc(512);
	header.write(name, 0, "utf8");
	header.write("0000777\0", 100, "utf8");
	header.write("0000000\0", 108, "utf8");
	header.write("0000000\0", 116, "utf8");
	header.write(`${size.toString(8).padStart(11, "0")}\0`, 124, "utf8");
	header.write(
		`${Math.floor(Date.now() / 1000)
			.toString(8)
			.padStart(11, "0")}\0`,
		136,
		"utf8",
	);
	header.write("        ", 148, "utf8");
	header.write("0", 156, "utf8");
	header.write("ustar\0", 257, "utf8");
	header.write("00", 263, "utf8");
	let checksum = 0;
	for (const byte of header) checksum += byte;
	header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "utf8");
	return header;
};

const buildMaliciousTarGz = (entryName: string, content: Buffer): Buffer => {
	const header = ustarHeader(entryName, content.length);
	const padded = Buffer.concat([
		content,
		Buffer.alloc((512 - (content.length % 512)) % 512),
	]);
	const archive = Buffer.concat([header, padded, Buffer.alloc(1024)]);
	return gzipSync(archive);
};

const ustarSymlinkHeader = (name: string, linkTarget: string): Buffer => {
	const header = Buffer.alloc(512);
	header.write(name, 0, "utf8");
	header.write("0000777\0", 100, "utf8");
	header.write("0000000\0", 108, "utf8");
	header.write("0000000\0", 116, "utf8");
	header.write(`${(0).toString(8).padStart(11, "0")}\0`, 124, "utf8");
	header.write(
		`${Math.floor(Date.now() / 1000)
			.toString(8)
			.padStart(11, "0")}\0`,
		136,
		"utf8",
	);
	header.write("        ", 148, "utf8");
	header.write("2", 156, "utf8");
	header.write(linkTarget, 157, "utf8");
	header.write("ustar\0", 257, "utf8");
	header.write("00", 263, "utf8");
	let checksum = 0;
	for (const byte of header) checksum += byte;
	header.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, "utf8");
	return header;
};

const buildSymlinkTarGz = (entryName: string, linkTarget: string): Buffer => {
	const header = ustarSymlinkHeader(entryName, linkTarget);
	const archive = Buffer.concat([header, Buffer.alloc(1024)]);
	return gzipSync(archive);
};

let workDir: string;
let outDir: string;
let bundlePath: string;

const buildBundle = async () => {
	const db = fakeDb();
	const captureResult = await capture(
		db,
		{ kind: "project", id: "project-1" },
		baseScope,
		{
			detectRequirements: (tree, scope) => detectRequirements(db, tree, scope),
			detectWarnings: (tree, scope) => detectWarnings(tree, scope),
		},
	);

	await serialize(
		{
			resources: captureResult.resources,
			inventory: captureResult.inventory,
			requirements: captureResult.requirements,
			warnings: captureResult.warnings,
			dumps: [],
			scope: baseScope,
			organizationId: "org-1",
			dokployVersion: "1.0.0-test",
			exportedBy: { userId: "user-1", email: "a@b.com" },
		},
		captureResult.secretsPlain,
		PASSPHRASE,
		local(workDir),
		local(bundlePath),
	);
};

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "transfer-deser-work-"));
	outDir = await mkdtemp(join(tmpdir(), "transfer-deser-out-"));
	bundlePath = join(outDir, "bundle.dokploy.tar.gz");
});

afterEach(async () => {
	await rm(workDir, { recursive: true, force: true });
	await rm(outDir, { recursive: true, force: true });
});

describe("deserialize: inspectBundle + unlockBundle", () => {
	it("round-trips the exact snapshot through inspect + unlock", async () => {
		await buildBundle();

		const extractDir = await mkdtemp(join(tmpdir(), "transfer-deser-extract-"));
		try {
			const inspected = await inspectBundle(
				local(bundlePath),
				local(extractDir),
			);
			expect(inspected.manifest.sourceInstance.organizationId).toBe("org-1");
			expect(inspected.inventory.totals.application).toBe(1);
			expect(Array.isArray(inspected.requirements)).toBe(true);
			expect(Array.isArray(inspected.warnings)).toBe(true);

			expect(existsSync(join(extractDir, "resources"))).toBe(false);
			const unlocked = await unlockBundle(local(extractDir), PASSPHRASE);
			expect(unlocked.snapshot.manifest).toEqual(inspected.manifest);
			expect(existsSync(join(extractDir, "payload.enc"))).toBe(false);
			expect(existsSync(join(extractDir, "secrets.json"))).toBe(false);
			expect(unlocked.snapshot.resources.project).toMatchObject({
				projectId: "project-1",
				name: "my-project",
			});
			expect(unlocked.snapshot.resources.environments).toHaveLength(1);

			const decryptedValues = Array.from(unlocked.secretsPlain.values());
			expect(decryptedValues).toContain("realdbpassword123");
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	}, 30_000);

	it("throws TransferCryptoError on a wrong passphrase", async () => {
		await buildBundle();

		const extractDir = await mkdtemp(join(tmpdir(), "transfer-deser-extract-"));
		try {
			await inspectBundle(local(bundlePath), local(extractDir));
			await expect(
				unlockBundle(local(extractDir), "totally-wrong-passphrase-here"),
			).rejects.toThrow(TransferCryptoError);
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	});

	it("throws TransferCryptoError when the encrypted payload is tampered with", async () => {
		await buildBundle();

		const extractDir = await mkdtemp(join(tmpdir(), "transfer-deser-extract-"));
		try {
			await inspectBundle(local(bundlePath), local(extractDir));
			const payloadPath = join(extractDir, "payload.enc");
			const bytes = await readFile(payloadPath);
			const middle = Math.floor(bytes.length / 2);
			bytes[middle] = (bytes[middle] ?? 0) ^ 0xff;
			await writeFile(payloadPath, bytes);

			await expect(unlockBundle(local(extractDir), PASSPHRASE)).rejects.toThrow(
				TransferCryptoError,
			);
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	});

	it("rejects a tar entry that attempts path traversal", async () => {
		const maliciousBundle = join(outDir, "evil.dokploy.tar.gz");
		await writeFile(
			maliciousBundle,
			buildMaliciousTarGz("../../etc/evil-payload", Buffer.from("evil")),
		);

		const extractDir = await mkdtemp(
			join(tmpdir(), "transfer-deser-extract-evil-"),
		);
		try {
			await expect(
				inspectBundle(local(maliciousBundle), local(extractDir)),
			).rejects.toThrow(/unsafe path/i);
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	});

	it("rejects a gzip bomb before extracting anything", async () => {
		const bomb = join(outDir, "bomb.dokploy.tar.gz");
		await writeFile(
			bomb,
			buildMaliciousTarGz("manifest.json", Buffer.alloc(1024 * 1024)),
		);

		const extractDir = await mkdtemp(
			join(tmpdir(), "transfer-deser-extract-bomb-"),
		);
		try {
			await expect(
				inspectBundle(local(bomb), local(extractDir), {
					maxDecompressedBytes: 64 * 1024,
				}),
			).rejects.toThrow(/decompressed size/);
			expect(existsSync(join(extractDir, "manifest.json"))).toBe(false);
			// A post-extraction failure removes the directory; the pre-check never touches it.
			expect(existsSync(extractDir)).toBe(true);
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	});

	it("rejects an escaping symlink even when its name contains a tab", async () => {
		const maliciousBundle = join(outDir, "evil-tab-symlink.dokploy.tar.gz");
		await writeFile(
			maliciousBundle,
			buildSymlinkTarGz("x\ty", "../../../../etc"),
		);

		const extractDir = await mkdtemp(
			join(tmpdir(), "transfer-deser-extract-tab-"),
		);
		try {
			await expect(
				inspectBundle(local(maliciousBundle), local(extractDir)),
			).rejects.toThrow(/unsafe symlink/i);
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	});

	it("rejects a symlink entry whose target escapes workDir", async () => {
		const maliciousBundle = join(outDir, "evil-symlink.dokploy.tar.gz");
		await writeFile(
			maliciousBundle,
			buildSymlinkTarGz("innocuous-name.txt", "../../../../etc/passwd"),
		);

		const extractDir = await mkdtemp(
			join(tmpdir(), "transfer-deser-extract-symlink-"),
		);
		try {
			await expect(
				inspectBundle(local(maliciousBundle), local(extractDir)),
			).rejects.toThrow(/unsafe symlink/i);
		} finally {
			await rm(extractDir, { recursive: true, force: true });
		}
	});
});
