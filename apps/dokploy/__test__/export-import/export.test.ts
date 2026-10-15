import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type {
	ExportScope,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	capture,
	detectRequirements,
	detectWarnings,
	manifestSchema,
	serialize,
} from "@dokploy/server/services/project-export-import";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const local = (path: string) => ({ serverId: null, path });

const PASSPHRASE = "correct-horse-battery-staple";
const SECRET_VALUES = [
	"hunter2-vault-secret-placeholder",
	"realdbpassword123",
	"registrypassword456",
	"basicauthpassword789",
];

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
	refreshToken: "webhook-token-should-never-appear",
	registryId: "registry-1",
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
	security: [
		{
			securityId: "sec-1",
			username: "admin",
			password: "basicauthpassword789",
			createdAt: "2024-01-01",
		},
	],
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
			vaultProvider: {
				findMany: async () => [
					{
						vaultProviderId: "vault-1",
						name: "prod",
						providerType: "hashicorp",
						organizationId: "org-1",
					},
				],
			},
			registry: {
				findMany: async () => [
					{
						registryId: "registry-1",
						registryUrl: "https://registry.example.com",
						imagePrefix: "acme",
						password: "registrypassword456",
					},
				],
				findFirst: async () => ({
					registryId: "registry-1",
					registryUrl: "https://registry.example.com",
					imagePrefix: "acme",
					password: "registrypassword456",
				}),
			},
			destinations: { findMany: async () => [] },
			network: { findMany: async () => [] },
			certificates: { findMany: async () => [] },
		},
	}) as any as TransferDb;

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: { registry: "value" },
	files: {
		applicationSources: false,
		composeFiles: false,
		traefikRaw: false,
		customCertificates: false,
	},
	dumps: { mode: "none" },
	includeBackupSchedules: true,
};

const walkFiles = async (dir: string, base = dir): Promise<string[]> => {
	const entries = await readdir(dir, { withFileTypes: true });
	const files: string[] = [];
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(full, base)));
		} else {
			files.push(relative(base, full));
		}
	}
	return files;
};

let workDir: string;
let outDir: string;

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "transfer-export-integration-work-"));
	outDir = await mkdtemp(join(tmpdir(), "transfer-export-integration-out-"));
});

afterEach(async () => {
	await rm(workDir, { recursive: true, force: true });
	await rm(outDir, { recursive: true, force: true });
});

describe("export integration: capture -> serialize", () => {
	it("produces a valid, checksummed, secret-free bundle from a realistic project", async () => {
		const db = fakeDb();
		const captureResult = await capture(
			db,
			{ kind: "project", id: "project-1" },
			baseScope,
			{
				detectRequirements: (tree, scope) =>
					detectRequirements(db, tree, scope),
				detectWarnings: (tree, scope) => detectWarnings(tree, scope),
			},
		);

		expect(captureResult.requirements.some((r) => r.kind === "vault")).toBe(
			true,
		);
		expect(captureResult.requirements.some((r) => r.kind === "registry")).toBe(
			true,
		);

		const bundlePath = join(outDir, "bundle.dokploy.tar.gz");
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

		const extractDir = join(outDir, "extracted");
		await execAsync(
			`mkdir -p "${extractDir}" && tar -xzf "${bundlePath}" -C "${extractDir}"`,
		);

		const manifestRaw = JSON.parse(
			await readFile(join(extractDir, "manifest.json"), "utf8"),
		);
		const manifestResult = manifestSchema.safeParse(manifestRaw);
		expect(manifestResult.success).toBe(true);

		const relativeFiles = await walkFiles(extractDir);
		expect(relativeFiles.sort()).toEqual([
			"inventory.json",
			"manifest.json",
			"payload.enc",
			"requirements.json",
			"warnings.json",
		]);

		const inventory = JSON.parse(
			await readFile(join(extractDir, "inventory.json"), "utf8"),
		);
		expect(inventory.totals.application).toBe(1);
		expect(inventory.totals.postgres).toBe(1);

		const requirements = JSON.parse(
			await readFile(join(extractDir, "requirements.json"), "utf8"),
		);
		expect(Array.isArray(requirements)).toBe(true);
		expect(requirements.length).toBeGreaterThan(0);

		for (const relativePath of relativeFiles) {
			const bytes = await readFile(join(extractDir, relativePath));
			for (const secret of SECRET_VALUES) {
				expect(bytes.includes(secret)).toBe(false);
			}
			expect(bytes.includes("webhook-token-should-never-appear")).toBe(false);
		}
	});
});
