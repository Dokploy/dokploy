import type {
	ExportScope,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	CaptureNotFoundError,
	capture,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const application1 = {
	applicationId: "app-1",
	name: "app-1",
	appName: "app-one",
	environmentId: "env-1",
	env: "DB_PASS=hunter2\nAPI_KEY=abc123",
	buildArgs: null,
	serverId: "server-1",
	buildServerId: "server-1",
	githubId: "gh-1",
	gitlabId: null,
	giteaId: null,
	bitbucketId: null,
	refreshToken: "webhook-token-1",
	createdAt: "2024-01-01T00:00:00.000Z",
	domains: [
		{ domainId: "dom-1", host: "app-1.example.com", createdAt: "2024-01-01" },
	],
	mounts: [
		{
			mountId: "mount-1",
			type: "file",
			content: "server { listen 80; }",
			createdAt: "2024-01-01",
		},
		{
			mountId: "mount-2",
			type: "bind",
			content: null,
			createdAt: "2024-01-01",
		},
	],
	redirects: [],
	security: [
		{
			securityId: "sec-1",
			username: "admin",
			password: "basicauthpass",
			createdAt: "2024-01-01",
		},
	],
	ports: [],
	schedules: [],
	volumeBackups: [],
};

const application2 = {
	applicationId: "app-2",
	name: "app-2",
	appName: "app-two",
	environmentId: "env-2",
	env: "",
	serverId: "server-1",
	createdAt: "2024-01-01T00:00:00.000Z",
	domains: [],
	mounts: [],
	redirects: [],
	security: [],
	ports: [],
	schedules: [],
	volumeBackups: [],
};

const postgres1 = {
	postgresId: "pg-1",
	name: "pg-1",
	appName: "pg-one",
	environmentId: "env-1",
	env: "PGPASS=supersecret",
	databasePassword: "realdbpassword",
	serverId: "server-1",
	createdAt: "2024-01-01T00:00:00.000Z",
	mounts: [],
	backups: [
		{
			backupId: "backup-1",
			createdAt: "2024-01-01T00:00:00.000Z",
			metadata: {
				mariadb: { databaseUser: "u", databasePassword: "metasecret" },
			},
		},
	],
	volumeBackups: [],
};

const mysql1 = {
	mysqlId: "mysql-1",
	name: "mysql-1",
	appName: "mysql-one",
	environmentId: "env-1",
	env: "",
	serverId: "server-1",
	createdAt: "2024-01-01T00:00:00.000Z",
	mounts: [],
	backups: [],
	volumeBackups: [],
};

const emptyServiceArrays = {
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
			applications: [application1],
			postgres: [postgres1],
			mysql: [mysql1],
			...emptyServiceArrays,
		},
		{
			environmentId: "env-2",
			name: "staging",
			projectId: "project-1",
			env: "",
			isDefault: false,
			createdAt: "2024-01-01T00:00:00.000Z",
			applications: [application2],
			postgres: [],
			mysql: [],
			...emptyServiceArrays,
		},
	],
};

const fakeDb = (): TransferDb =>
	({
		query: {
			projects: {
				findFirst: async () => projectTree,
			},
			environments: {
				findFirst: async () => undefined,
			},
			applications: {
				findMany: async () => [application1, application2],
				findFirst: async () => undefined,
			},
			schedules: {
				findMany: async () => [],
			},
			volumeBackups: {
				findMany: async () => [],
			},
		},
	}) as any;

const baseScope: ExportScope = {
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
};

const noopOpts = {
	detectRequirements: () => [],
	detectWarnings: () => [],
};

describe("capture", () => {
	it("throws CaptureNotFoundError when the project doesn't exist", async () => {
		const db = {
			query: {
				projects: { findFirst: async () => undefined },
				environments: { findFirst: async () => undefined },
			},
		} as any as TransferDb;
		await expect(
			capture(db, { kind: "project", id: "missing" }, baseScope, noopOpts),
		).rejects.toThrow(CaptureNotFoundError);
	});

	it("filters by environmentIds and serviceIds", async () => {
		const result = await capture(
			fakeDb(),
			{ kind: "project", id: "project-1" },
			{
				...baseScope,
				environmentIds: ["env-1"],
				serviceIds: ["app-1", "pg-1"],
			},
			noopOpts,
		);

		expect(result.resources.environments).toHaveLength(1);
		expect(result.resources.environments[0]?.environmentId).toBe("env-1");
		expect(result.resources.services).toHaveLength(2);
		const ids = result.resources.services
			.map((s) => (s.applicationId ?? s.postgresId) as string)
			.sort();
		expect(ids).toEqual(["app-1", "pg-1"]);
	});

	it("never leaks NEVER_EXPORT_FIELDS", async () => {
		const result = await capture(
			fakeDb(),
			{ kind: "project", id: "project-1" },
			baseScope,
			noopOpts,
		);

		const serialized = JSON.stringify(result.resources);
		for (const forbidden of [
			"server-1",
			"gh-1",
			"webhook-token-1",
			"2024-01-01T00:00:00.000Z",
		]) {
			expect(serialized).not.toContain(forbidden);
		}
	});

	it("replaces every SECRET_FIELDS value with $secret: and recovers it via secretsPlain", async () => {
		const result = await capture(
			fakeDb(),
			{ kind: "project", id: "project-1" },
			baseScope,
			noopOpts,
		);

		const serialized = JSON.stringify(result.resources);
		expect(serialized).not.toContain("hunter2");
		expect(serialized).not.toContain("abc123");
		expect(serialized).not.toContain("supersecret");
		expect(serialized).not.toContain("basicauthpass");
		expect(serialized).not.toContain("server { listen 80; }");
		expect(serialized).not.toContain("realdbpassword");
		expect(serialized).not.toContain("metasecret");

		const pg1Resource = result.resources.services.find(
			(s) => s.postgresId === "pg-1",
		) as Record<string, unknown>;
		expect(String(pg1Resource.databasePassword)).toMatch(/^\$secret:/);
		expect(
			result.secretsPlain.get(
				String(pg1Resource.databasePassword).slice("$secret:".length),
			),
		).toBe("realdbpassword");
		const pgBackups = pg1Resource.backups as Record<string, unknown>[];
		expect(String(pgBackups[0]?.metadata)).toMatch(/^\$secret:/);

		const app1Resource = result.resources.services.find(
			(s) => s.applicationId === "app-1",
		) as Record<string, unknown>;
		expect(app1Resource.env).toMatch(
			/^DB_PASS=\$secret:.+\nAPI_KEY=\$secret:.+$/,
		);

		const dbPassId = (app1Resource.env as string).match(
			/DB_PASS=\$secret:([^\n]+)/,
		)?.[1];
		expect(dbPassId).toBeDefined();
		expect(result.secretsPlain.get(dbPassId as string)).toBe("hunter2");

		const mounts = app1Resource.mounts as Record<string, unknown>[];
		const fileMount = mounts.find((m) => m.mountId === "mount-1");
		expect(String(fileMount?.content)).toMatch(/^\$secret:/);
		const bindMount = mounts.find((m) => m.mountId === "mount-2");
		expect(bindMount?.content).toBeNull();

		const security = app1Resource.security as Record<string, unknown>[];
		expect(String(security[0]?.password)).toMatch(/^\$secret:/);
	});

	it("redacts secrets instead of capturing them when includeEnvSecrets is false", async () => {
		const result = await capture(
			fakeDb(),
			{ kind: "project", id: "project-1" },
			{ ...baseScope, includeEnvSecrets: false },
			noopOpts,
		);

		expect(result.secretsPlain.size).toBe(0);
		const app1Resource = result.resources.services.find(
			(s) => s.applicationId === "app-1",
		) as Record<string, unknown>;
		expect(app1Resource.env).toBe(
			"DB_PASS=$secret:REDACTED\nAPI_KEY=$secret:REDACTED",
		);
	});

	it("redacts a vault provider's config when exported by value (shared.vault, not shared.vaultProvider)", async () => {
		const db = {
			query: {
				...(fakeDb() as any).query,
				vaultProvider: {
					findFirst: async () => ({
						vaultProviderId: "vault-1",
						name: "prod",
						providerType: "hashicorp",
						organizationId: "org-1",
						config: { token: "s.super-secret-vault-token" },
						assignments: [
							{ projectId: "old-project", environmentIds: ["old-env"] },
						],
					}),
				},
			},
		} as any as TransferDb;

		const result = await capture(
			db,
			{ kind: "project", id: "project-1" },
			{ ...baseScope, shared: { vaultProvider: "value" } },
			{
				detectRequirements: () => [
					{
						kind: "vault",
						originalId: "vault-1",
						configIncluded: true,
						usedBy: [],
						providerName: "prod",
						providerType: "hashicorp",
						secretKeys: [],
					},
				],
				detectWarnings: () => [],
			},
		);

		const serialized = JSON.stringify(result.resources.shared);
		expect(serialized).not.toContain("s.super-secret-vault-token");
		expect(serialized).not.toContain("old-project");

		const [vaultRow] = result.resources.shared.vault ?? [];
		expect(String(vaultRow?.config)).toMatch(/^\$secret:/);
		const secretId = String(vaultRow?.config).slice("$secret:".length);
		expect(JSON.parse(result.secretsPlain.get(secretId) ?? "{}")).toEqual({
			token: "s.super-secret-vault-token",
		});
		expect(vaultRow?.assignments).toBeUndefined();
	});

	it("builds an inventory reflecting the filtered scope", async () => {
		const result = await capture(
			fakeDb(),
			{ kind: "project", id: "project-1" },
			{ ...baseScope, environmentIds: ["env-1"] },
			noopOpts,
		);

		expect(result.inventory.environments).toHaveLength(1);
		expect(result.inventory.environments[0]).toMatchObject({
			id: "env-1",
			services: { application: 1, postgres: 1, mysql: 1 },
		});
		expect(result.inventory.totals.domain).toBe(1);
		expect(result.inventory.totals.mount).toBe(2);
	});

	it("excludes backup schedules when scope.includeBackupSchedules is false", async () => {
		const result = await capture(
			fakeDb(),
			{ kind: "project", id: "project-1" },
			{ ...baseScope, includeBackupSchedules: false },
			noopOpts,
		);

		const postgresRow = result.resources.services.find(
			(service) => service.kind === "postgres",
		);
		expect(postgresRow?.backups).toEqual([]);
		expect(result.inventory.totals.backup).toBeUndefined();
	});
});

describe("capture project tags", () => {
	it("flattens projectTags into resources.project.tags", async () => {
		const db = fakeDb();
		(db.query.projects as any).findFirst = async () => ({
			...projectTree,
			projectTags: [
				{ tag: { tagId: "t-1", name: "prod", color: "#f00" } },
				{ tag: { tagId: "t-2", name: "billing", color: null } },
			],
		});
		const result = await capture(
			db,
			{ kind: "project", id: "project-1" },
			baseScope,
			noopOpts,
		);
		expect(result.resources.project.tags).toEqual([
			{ name: "prod", color: "#f00" },
			{ name: "billing", color: null },
		]);
		expect(result.resources.project).not.toHaveProperty("projectTags");
	});

	it("forces vault and dns providers to reference when env secrets are excluded", async () => {
		const db = fakeDb();
		(db.query as any).dnsProvider = {
			findMany: async () => [
				{ dnsProviderId: "dns-1", name: "cf", config: {} },
			],
		};
		const result = await capture(
			db,
			{ kind: "project", id: "project-1" },
			{
				...baseScope,
				includeEnvSecrets: false,
				shared: { dnsProvider: "value", vaultProvider: "value" },
			},
			noopOpts,
		);
		expect(result.resources.shared.dnsProvider).toBeUndefined();
	});
});
