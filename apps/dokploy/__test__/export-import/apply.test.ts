import {
	applications,
	backups,
	domains,
	mounts,
	ports,
	projects,
	security,
	vaultProvider,
} from "@dokploy/server/db/schema";
import type {
	ExportScope,
	Plan,
	Snapshot,
	TransferDb,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import {
	apply,
	buildPlan,
	capture,
	detectRequirements,
	detectWarnings,
	LOCAL_SERVER_CANDIDATE_ID,
	requirementKey,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const application = {
	applicationId: "app-1",
	name: "my-app",
	appName: "my-app-abc123",
	environmentId: "env-1",
	env: "DB_PASS=${{vault.prod.DB_PASS}}\nAPI_TOKEN=abc123token",
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
	registryId: "registry-src-1",
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
	domains: [
		{ domainId: "dom-1", host: "app-1.example.com", createdAt: "2024-01-01" },
	],
	mounts: [
		{
			mountId: "mount-1",
			type: "file",
			content: "server { listen 80; }",
			mountPath: "/etc/nginx/nginx.conf",
			serviceType: "application",
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
	ports: [
		{
			portId: "port-1",
			publishedPort: 8080,
			publishMode: "host",
			targetPort: 80,
			protocol: "tcp",
		},
	],
	schedules: [],
	volumeBackups: [],
};

const emptyServiceArrays = {
	postgres: [],
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
	organizationId: "org-src",
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
			...emptyServiceArrays,
		},
	],
};

const readDb = (): TransferDb =>
	({
		query: {
			projects: { findFirst: async () => projectTree },
			environments: { findFirst: async () => undefined },
			applications: {
				findMany: async () => [application],
				findFirst: async () => undefined,
			},
			schedules: { findMany: async () => [] },
			volumeBackups: { findMany: async () => [] },
			vaultProvider: {
				findMany: async () => [
					{
						vaultProviderId: "vault-dest-1",
						name: "prod",
						providerType: "hashicorp",
						organizationId: "org-dest",
					},
				],
				findFirst: async () => ({
					vaultProviderId: "vault-dest-1",
					name: "prod",
					providerType: "hashicorp",
					organizationId: "org-dest",
					config: {
						providerType: "hashicorp",
						url: "https://vault",
						token: "t",
					},
					assignments: [],
				}),
			},
			registry: {
				findMany: async () => [
					{
						registryId: "registry-src-1",
						registryName: "Acme",
						registryUrl: "https://registry.example.com",
						imagePrefix: "acme",
						username: "user",
						password: "pass",
						organizationId: "org-src",
					},
				],
				findFirst: async () => ({
					registryId: "registry-dest-1",
					registryName: "Acme",
					registryUrl: "https://registry.example.com",
					imagePrefix: "acme",
					username: "user",
					password: "pass",
					organizationId: "org-dest",
				}),
			},
			destinations: { findMany: async () => [] },
			network: { findMany: async () => [] },
			certificates: { findMany: async () => [] },
			gitProvider: { findMany: async () => [] },
			server: {
				findMany: async () => [],
				findFirst: async () => ({ organizationId: "org-dest" }),
			},
			webServerSettings: { findFirst: async () => undefined },
			sshKeys: { findMany: async () => [] },
			domains: { findMany: async () => [] },
			postgres: {
				findMany: async () => [],
				findFirst: async () => undefined,
			},
			mysql: {
				findMany: async () => [],
				findFirst: async () => undefined,
			},
			mariadb: {
				findMany: async () => [],
				findFirst: async () => undefined,
			},
			mongo: {
				findMany: async () => [],
				findFirst: async () => undefined,
			},
			redis: {
				findMany: async () => [],
				findFirst: async () => undefined,
			},
			libsql: {
				findMany: async () => [],
				findFirst: async () => undefined,
			},
			ports: { findMany: async () => [] },
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

describe("apply", () => {
	it("inserts project/environment/application/children with secrets restored, vault names rewritten, and no $secret: leaking through", async () => {
		const db = readDb();
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

		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: baseScope,
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: captureResult.inventory.totals,
			},
			resources: captureResult.resources,
			requirements: captureResult.requirements,
			warnings: captureResult.warnings,
			dumps: [],
		};

		const vaultKey = requirementKey(
			captureResult.requirements.find((r) => r.kind === "vault")!,
		);
		const registryKey = requirementKey(
			captureResult.requirements.find((r) => r.kind === "registry")!,
		);

		const plan = await buildPlan(
			db,
			snapshot,
			"org-dest",
			{
				kind: "newProject",
				name: "imported-project",
			},
			{
				resolutions: {
					[vaultKey]: {
						requirementKey: vaultKey,
						action: "reuse",
						targetId: "vault-dest-1",
					},
					[registryKey]: {
						requirementKey: registryKey,
						action: "reuse",
						targetId: "registry-dest-1",
					},
				},
			},
		);

		const insertedByTable = new Map<unknown, Record<string, unknown>[]>();
		let counter = 0;
		const idFieldByTable = new Map<unknown, string>([
			[projects, "projectId"],
			[applications, "applicationId"],
			[domains, "domainId"],
			[mounts, "mountId"],
			[ports, "portId"],
			[security, "securityId"],
		]);
		const environmentsTable = (await import("@dokploy/server/db/schema"))
			.environments;
		idFieldByTable.set(environmentsTable, "environmentId");

		const vaultUpdates: Record<string, unknown>[] = [];

		const writeDb = {
			query: {
				vaultProvider: {
					findFirst: async () => ({
						vaultProviderId: "vault-dest-1",
						name: "prod",
						organizationId: "org-dest",
						assignments: [],
					}),
				},
				registry: {
					findFirst: async () => ({
						registryId: "registry-dest-1",
						organizationId: "org-dest",
					}),
				},
				github: { findFirst: async () => undefined },
				gitlab: { findFirst: async () => undefined },
				gitea: { findFirst: async () => undefined },
				bitbucket: { findFirst: async () => undefined },
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const idField = idFieldByTable.get(table);
					const row = { ...values };
					if (idField) {
						row[idField] =
							(values[idField] as string | undefined) ??
							`new-${idField}-${++counter}`;
					}
					const list = insertedByTable.get(table) ?? [];
					list.push(row);
					insertedByTable.set(table, list);
					return { returning: async () => [row] };
				},
			}),
			update: (table: unknown) => ({
				set: (values: Record<string, unknown>) => ({
					where: async () => {
						if (table === vaultProvider) {
							vaultUpdates.push(values);
						}
					},
				}),
			}),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = { ...writeDb };
				return fn(tx);
			},
		} as any as TransferWriteDb;

		const result = await apply(
			writeDb,
			snapshot,
			plan,
			captureResult.secretsPlain,
			"org-dest",
		);

		const insertedApplications = insertedByTable.get(applications) ?? [];
		expect(insertedApplications).toHaveLength(1);
		const insertedApp = insertedApplications[0] as Record<string, unknown>;
		expect(insertedApp.registryId).toBe("registry-dest-1");
		expect(insertedApp.env).toBe(
			"DB_PASS=${{vault.prod.DB_PASS}}\nAPI_TOKEN=abc123token",
		);
		expect(String(insertedApp.env)).not.toContain("$secret:");

		const insertedDomains = insertedByTable.get(domains) ?? [];
		expect(insertedDomains).toHaveLength(1);
		expect(insertedDomains[0]?.applicationId).toBe(insertedApp.applicationId);

		const insertedMounts = insertedByTable.get(mounts) ?? [];
		expect(insertedMounts[0]?.content).toBe("server { listen 80; }");

		const insertedSecurity = insertedByTable.get(security) ?? [];
		expect(insertedSecurity[0]?.password).toBe("basicauthpass");

		const insertedPorts = insertedByTable.get(ports) ?? [];
		expect(insertedPorts).toHaveLength(1);

		const serialized = JSON.stringify(insertedByTable.get(applications));
		expect(serialized).not.toContain("$secret:");

		expect(vaultUpdates).toHaveLength(1);
		const projectRow = (insertedByTable.get(projects) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(
			(vaultUpdates[0]?.assignments as { projectId: string }[]).map(
				(a) => a.projectId,
			),
		).toContain(projectRow.projectId);

		expect(result.idMap.project?.["project-1"]).toBe(projectRow.projectId);
		expect(result.idMap.application?.["app-1"]).toBe(insertedApp.applicationId);
	});
});

describe("apply cross-org IDOR guards (T-6.1/T-6.2)", () => {
	const minimalSnapshot = (
		requirements: Snapshot["requirements"],
	): Snapshot => ({
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: {
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
			},
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: {},
		},
		resources: {
			project: { projectId: "project-1", name: "my-project" },
			environments: [],
			services: [],
			shared: {},
		},
		requirements,
		warnings: [],
		dumps: [],
	});

	const minimalWriteDb = (
		queryOverrides: Record<string, unknown>,
	): TransferWriteDb => {
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				...queryOverrides,
			},
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					returning: async () => [
						{
							...values,
							projectId: "new-project-1",
							environmentId: "new-env-1",
							applicationId: "new-app-1",
						},
					],
				}),
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		};
		return writeDb as any as TransferWriteDb;
	};

	it("refuses to reuse a destination belonging to a different organization", async () => {
		const requirement = {
			kind: "destination" as const,
			originalId: "dest-src",
			configIncluded: false,
			usedBy: [],
			name: "s3-backups",
			provider: "s3" as const,
			bucket: "my-bucket",
			endpoint: "https://s3.example.com",
			region: "us-east-1",
		};
		const snapshot = minimalSnapshot([requirement]);
		const key = requirementKey(requirement);
		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {
				[key]: {
					requirementKey: key,
					action: "reuse" as const,
					targetId: "dest-other-org",
				},
			},
			serverMap: {},
			appNameMap: {},
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};
		const writeDb = minimalWriteDb({
			destinations: {
				findFirst: async () => ({
					destinationId: "dest-other-org",
					organizationId: "org-OTHER",
				}),
			},
		});

		await expect(
			apply(writeDb, snapshot, plan, new Map(), "org-dest"),
		).rejects.toThrow(/not found in this organization/);
	});

	it("refuses to reuse a gitProvider belonging to a different organization", async () => {
		const requirement = {
			kind: "gitProvider" as const,
			originalId: "gp-src",
			configIncluded: false,
			usedBy: [
				{
					serviceId: "app-1",
					serviceType: "application" as const,
					serviceName: "my-app",
					environmentId: "env-1",
				},
			],
			providerType: "github" as const,
			repositories: [],
		};
		const snapshot = {
			...minimalSnapshot([requirement]),
			resources: {
				project: { projectId: "project-1", name: "my-project" },
				environments: [{ environmentId: "env-1", name: "production" }],
				services: [
					{
						kind: "application",
						applicationId: "app-1",
						name: "my-app",
						appName: "my-app-abc123",
						environmentId: "env-1",
					},
				],
				shared: {},
			},
		};
		const key = requirementKey(requirement);
		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {
				[key]: {
					requirementKey: key,
					action: "reuse" as const,
					targetId: "gp-other-org",
				},
			},
			serverMap: {},
			appNameMap: { "my-app-abc123": "my-app-new" },
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};
		const writeDb = minimalWriteDb({
			gitProvider: {
				findFirst: async () => ({
					gitProviderId: "gp-other-org",
					organizationId: "org-OTHER",
				}),
			},
		});

		await expect(
			apply(writeDb, snapshot, plan, new Map(), "org-dest"),
		).rejects.toThrow(/not found in this organization/);
	});

	it("refuses to reuse a server belonging to a different organization", async () => {
		const requirement = {
			kind: "server" as const,
			originalId: "server-src-1",
			configIncluded: false,
			usedBy: [],
		};
		const snapshot = minimalSnapshot([requirement]);
		const key = requirementKey(requirement);
		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {
				[key]: {
					requirementKey: key,
					action: "reuse" as const,
					targetId: "server-other-org",
				},
			},
			serverMap: { "server-src-1": "server-other-org" },
			appNameMap: {},
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};
		const writeDb = minimalWriteDb({
			server: {
				findFirst: async () => ({
					serverId: "server-other-org",
					organizationId: "org-OTHER",
				}),
			},
		});

		await expect(
			apply(writeDb, snapshot, plan, new Map(), "org-dest"),
		).rejects.toThrow(/not found in this organization/);
	});

	it("refuses to import into an existing project belonging to a different organization", async () => {
		const snapshot = minimalSnapshot([]);
		const plan = {
			target: {
				kind: "existingProject" as const,
				projectId: "project-other-org",
				environmentName: "imported",
			},
			resolutions: {},
			serverMap: {},
			appNameMap: {},
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};
		const writeDb = minimalWriteDb({
			projects: {
				findFirst: async () => ({
					projectId: "project-other-org",
					organizationId: "org-OTHER",
				}),
			},
		});

		await expect(
			apply(writeDb, snapshot, plan, new Map(), "org-dest"),
		).rejects.toThrow(/not found in this organization/);
	});

	it("does not reject the local-server sentinel as if it were a foreign server", async () => {
		const requirement = {
			kind: "server" as const,
			originalId: "server-src-1",
			configIncluded: false,
			usedBy: [],
		};
		const snapshot = minimalSnapshot([requirement]);
		const key = requirementKey(requirement);
		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {
				[key]: {
					requirementKey: key,
					action: "reuse" as const,
					targetId: LOCAL_SERVER_CANDIDATE_ID,
				},
			},
			serverMap: {},
			appNameMap: {},
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};
		const writeDb = minimalWriteDb({});

		await expect(
			apply(writeDb, snapshot, plan, new Map(), "org-dest"),
		).resolves.toBeDefined();
	});
});

describe("apply: importing into an existing project (T-6.5)", () => {
	it("creates one destination environment per source environment, each with its own env-level secrets restored", async () => {
		const { environments: environmentsTable } = await import(
			"@dokploy/server/db/schema"
		);

		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: {
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
				},
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: {},
			},
			resources: {
				project: { projectId: "project-1", name: "my-project" },
				environments: [
					{
						environmentId: "env-1",
						name: "production",
						env: "SECRET_KEY=$secret:env-secret-1",
					},
					{
						environmentId: "env-2",
						name: "staging",
						env: "SECRET_KEY=$secret:env-secret-2",
					},
				],
				services: [],
				shared: {},
			},
			requirements: [],
			warnings: [],
			dumps: [],
		};

		const plan = {
			target: {
				kind: "existingProject" as const,
				projectId: "project-existing",
				environmentName: "imported",
			},
			resolutions: {},
			serverMap: {},
			appNameMap: {},
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		const insertedEnvironments: Record<string, unknown>[] = [];
		let counter = 0;
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				projects: {
					findFirst: async () => ({
						projectId: "project-existing",
						organizationId: "org-dest",
					}),
				},
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = { ...values, environmentId: `new-env-${++counter}` };
					if (table === environmentsTable) insertedEnvironments.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		const secretsPlain = new Map([
			["env-secret-1", "prod-value"],
			["env-secret-2", "staging-value"],
		]);

		await apply(writeDb, snapshot, plan, secretsPlain, "org-dest");

		expect(insertedEnvironments).toHaveLength(2);
		expect(insertedEnvironments[0]?.name).toBe("imported");
		expect(insertedEnvironments[0]?.env).toBe("SECRET_KEY=prod-value");
		expect(insertedEnvironments[1]?.name).toBe("imported-staging");
		expect(insertedEnvironments[1]?.env).toBe("SECRET_KEY=staging-value");
		expect(insertedEnvironments[0]?.environmentId).not.toBe(
			insertedEnvironments[1]?.environmentId,
		);
	});
});

describe("apply rewrites an auto-generated sslip.io domain's IP for the destination server (T-6.8)", () => {
	it("rewrites the embedded IP using the destination server's ipAddress", async () => {
		const { domains: domainsTable } = await import("@dokploy/server/db/schema");

		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: {
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
				},
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: {},
			},
			resources: {
				project: { projectId: "project-1", name: "my-project" },
				environments: [{ environmentId: "env-1", name: "production" }],
				services: [
					{
						kind: "application",
						applicationId: "app-1",
						appName: "my-app-abc123",
						environmentId: "env-1",
						serverId: "server-src-1",
						domains: [
							{
								domainId: "dom-1",
								host: "my-app-abc123-ab12cd-10-0-0-5.sslip.io",
							},
						],
					},
				],
				shared: {},
			},
			requirements: [
				{
					kind: "server",
					originalId: "server-src-1",
					configIncluded: false,
					usedBy: [
						{
							serviceId: "app-1",
							serviceType: "application",
							serviceName: "my-app",
							environmentId: "env-1",
							field: "serverId",
						},
					],
				},
			],
			warnings: [],
			dumps: [],
		};

		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {},
			serverMap: { "server-src-1": "server-dest-1" },
			appNameMap: { "my-app-abc123": "my-app-xyz789" },
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		const insertedDomains: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: {
					findFirst: async () => ({
						ipAddress: "203.0.113.9",
						organizationId: "org-dest",
					}),
				},
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						environmentId: "new-env-1",
						applicationId: "new-app-1",
					};
					if (table === domainsTable) insertedDomains.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(writeDb, snapshot, plan, new Map(), "org-dest");

		expect(insertedDomains).toHaveLength(1);
		expect(insertedDomains[0]?.host).toBe(
			"my-app-xyz789-ab12cd-203-0-113-9.sslip.io",
		);
	});
});

describe("apply honors plan.portsStrategy (T-6.10)", () => {
	const snapshotWithPort: Snapshot = {
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: {
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
			},
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: {},
		},
		resources: {
			project: { projectId: "project-1", name: "my-project" },
			environments: [{ environmentId: "env-1", name: "production" }],
			services: [
				{
					kind: "application",
					applicationId: "app-1",
					appName: "my-app-abc123",
					environmentId: "env-1",
					ports: [
						{ portId: "port-1", publishedPort: 8080, publishMode: "host" },
					],
				},
			],
			shared: {},
		},
		requirements: [],
		warnings: [],
		dumps: [],
	};

	const basePlan = {
		target: { kind: "newProject" as const, name: "imported" },
		resolutions: {},
		serverMap: {},
		appNameMap: { "my-app-abc123": "my-app-xyz789" },
		domainStrategy: { custom: "keep" as const },
		rotateDatabaseCredentials: false,
		conflicts: [],
		pendingServices: [],
		warnings: [],
		validation: [],
		summary: { counts: {}, domains: 0, dumps: 0 },
	};

	const runApplyTrackingPorts = async (portsStrategy: "keep" | "disable") => {
		const { ports: portsTable } = await import("@dokploy/server/db/schema");
		const insertedPorts: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						environmentId: "new-env-1",
						applicationId: "new-app-1",
					};
					if (table === portsTable) insertedPorts.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(
			writeDb,
			snapshotWithPort,
			{ ...basePlan, portsStrategy },
			new Map(),
			"org-dest",
		);
		return insertedPorts;
	};

	it("inserts the published port row when portsStrategy is 'keep'", async () => {
		const insertedPorts = await runApplyTrackingPorts("keep");
		expect(insertedPorts).toHaveLength(1);
	});

	it("inserts nothing when portsStrategy is 'disable'", async () => {
		const insertedPorts = await runApplyTrackingPorts("disable");
		expect(insertedPorts).toHaveLength(0);
	});
});

describe("apply's conflictingHosts override checks the final, post-strategy host (T-6.14)", () => {
	const snapshotWithDomain: Snapshot = {
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: {
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
			},
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: {},
		},
		resources: {
			project: { projectId: "project-1", name: "my-project" },
			environments: [{ environmentId: "env-1", name: "production" }],
			services: [
				{
					kind: "application",
					applicationId: "app-1",
					appName: "my-app-abc123",
					environmentId: "env-1",
					domains: [{ domainId: "dom-1", host: "api.example.com" }],
				},
			],
			shared: {},
		},
		requirements: [],
		warnings: [],
		dumps: [],
	};

	const conflicts = [
		{
			kind: "domain" as const,
			value: "api.example.com",
			existingId: "dom-existing-1",
			usedBy: [],
			options: ["rename" as const],
		},
	];

	const runApplyTrackingDomains = async (
		domainStrategy: Plan["domainStrategy"],
	) => {
		const { domains: domainsTable } = await import("@dokploy/server/db/schema");
		const insertedDomains: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						environmentId: "new-env-1",
						applicationId: "new-app-1",
					};
					if (table === domainsTable) insertedDomains.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {},
			serverMap: {},
			appNameMap: { "my-app-abc123": "my-app-xyz789" },
			domainStrategy,
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts,
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		await apply(writeDb, snapshotWithDomain, plan, new Map(), "org-dest");
		return insertedDomains;
	};

	it("inserts the prefixed host enabled, even though the bare host is a known conflict", async () => {
		const insertedDomains = await runApplyTrackingDomains({
			custom: "prefix",
			value: "staging-",
		});
		expect(insertedDomains).toHaveLength(1);
		expect(insertedDomains[0]?.host).toBe("staging-api.example.com");
		expect(insertedDomains[0]?.enabled).toBe(true);
	});

	it("still disables a 'keep' domain whose host really is the conflicting one", async () => {
		const insertedDomains = await runApplyTrackingDomains({ custom: "keep" });
		expect(insertedDomains).toHaveLength(1);
		expect(insertedDomains[0]?.host).toBe("api.example.com");
		expect(insertedDomains[0]?.enabled).toBe(false);
	});
});

describe("apply preserves a domain's own disabled state (T-11.1)", () => {
	const snapshotWithDisabledDomain: Snapshot = {
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: {
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
			},
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: {},
		},
		resources: {
			project: { projectId: "project-1", name: "my-project" },
			environments: [{ environmentId: "env-1", name: "production" }],
			services: [
				{
					kind: "application",
					applicationId: "app-1",
					appName: "my-app-abc123",
					environmentId: "env-1",
					domains: [
						{
							domainId: "dom-1",
							host: "old-staging.example.com",
							enabled: false,
						},
					],
				},
			],
			shared: {},
		},
		requirements: [],
		warnings: [],
		dumps: [],
	};

	const runApplyWithStrategy = async (
		domainStrategy: Plan["domainStrategy"],
	) => {
		const { domains: domainsTable } = await import("@dokploy/server/db/schema");
		const insertedDomains: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						environmentId: "new-env-1",
						applicationId: "new-app-1",
					};
					if (table === domainsTable) insertedDomains.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {},
			serverMap: {},
			appNameMap: { "my-app-abc123": "my-app-xyz789" },
			domainStrategy,
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		await apply(
			writeDb,
			snapshotWithDisabledDomain,
			plan,
			new Map(),
			"org-dest",
		);
		return insertedDomains;
	};

	it("keeps a source-disabled domain disabled under the 'keep' strategy", async () => {
		const insertedDomains = await runApplyWithStrategy({ custom: "keep" });
		expect(insertedDomains[0]?.enabled).toBe(false);
	});

	it("keeps a source-disabled domain disabled under the 'prefix' strategy", async () => {
		const insertedDomains = await runApplyWithStrategy({
			custom: "prefix",
			value: "staging-",
		});
		expect(insertedDomains[0]?.host).toBe("staging-old-staging.example.com");
		expect(insertedDomains[0]?.enabled).toBe(false);
	});
});

describe("apply surfaces dropped backups/volume backups as a warning (T-6.15)", () => {
	it("warns with BACKUP_DESTINATION_UNRESOLVED when a compose's backup/volumeBackup destinationId never resolved", async () => {
		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: {
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
				},
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: {},
			},
			resources: {
				project: { projectId: "project-1", name: "my-project" },
				environments: [{ environmentId: "env-1", name: "production" }],
				services: [
					{
						kind: "compose",
						composeId: "compose-1",
						name: "my-compose",
						appName: "my-compose-abc123",
						environmentId: "env-1",
						backups: [
							{
								backupId: "backup-1",
								destinationId: "dest-unresolved",
								schedule: "0 0 * * *",
							},
						],
						volumeBackups: [
							{
								volumeBackupId: "vb-1",
								destinationId: "dest-unresolved",
								volumeName: "my-compose-abc123-data",
							},
						],
					},
				],
				shared: {},
			},
			requirements: [],
			warnings: [],
			dumps: [],
		};

		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {},
			serverMap: {},
			appNameMap: { "my-compose-abc123": "my-compose-xyz789" },
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				github: { findFirst: async () => undefined },
				gitlab: { findFirst: async () => undefined },
				gitea: { findFirst: async () => undefined },
				bitbucket: { findFirst: async () => undefined },
			},
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					returning: async () => [
						{
							...values,
							projectId: "new-project-1",
							environmentId: "new-env-1",
							composeId: "new-compose-1",
						},
					],
				}),
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		const result = await apply(writeDb, snapshot, plan, new Map(), "org-dest");

		const backupWarning = result.warnings.find(
			(w) => w.code === "BACKUP_DESTINATION_UNRESOLVED",
		);
		expect(backupWarning).toBeDefined();
		expect(backupWarning?.message).toContain("2");
		expect(backupWarning?.affected).toContainEqual(
			expect.objectContaining({ serviceType: "compose" }),
		);
	});

	it("regenerates a backup's appName instead of reinserting the source one verbatim, retrying on collision", async () => {
		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: {
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
				},
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: {},
			},
			resources: {
				project: { projectId: "project-1", name: "my-project" },
				environments: [{ environmentId: "env-1", name: "production" }],
				services: [
					{
						kind: "compose",
						composeId: "compose-1",
						name: "my-compose",
						appName: "my-compose-abc123",
						environmentId: "env-1",
						backups: [
							{
								backupId: "backup-1",
								destinationId: "dest-1",
								appName: "backup-my-compose-745drl",
								schedule: "0 0 * * *",
							},
						],
						volumeBackups: [],
					},
				],
				shared: {},
			},
			requirements: [
				{
					kind: "destination",
					originalId: "dest-1",
					configIncluded: true,
					usedBy: [],
					bucket: "b",
					endpoint: "e",
					region: "r",
				},
			],
			warnings: [],
			dumps: [],
		};

		const destinationRequirement = snapshot.requirements[0]!;

		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {
				[requirementKey(destinationRequirement)]: {
					requirementKey: requirementKey(destinationRequirement),
					action: "reuse" as const,
					targetId: "dest-1-new",
				},
			},
			serverMap: {},
			appNameMap: { "my-compose-abc123": "my-compose-xyz789" },
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		const insertedBackupAppNames: string[] = [];
		let findFirstCalls = 0;

		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				github: { findFirst: async () => undefined },
				gitlab: { findFirst: async () => undefined },
				gitea: { findFirst: async () => undefined },
				bitbucket: { findFirst: async () => undefined },
				destinations: {
					findFirst: async () => ({ organizationId: "org-dest" }),
				},
				backups: {
					findFirst: async () => {
						findFirstCalls++;
						return findFirstCalls === 1
							? { backupId: "existing", appName: "taken" }
							: undefined;
					},
				},
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					if (table === backups && typeof values.appName === "string") {
						insertedBackupAppNames.push(values.appName);
					}
					return {
						returning: async () => [
							{
								...values,
								projectId: "new-project-1",
								environmentId: "new-env-1",
								composeId: "new-compose-1",
							},
						],
					};
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(writeDb, snapshot, plan, new Map(), "org-dest");

		expect(findFirstCalls).toBeGreaterThanOrEqual(2);
		expect(insertedBackupAppNames).toHaveLength(1);
		expect(insertedBackupAppNames[0]).not.toBe("backup-my-compose-745drl");
		expect(insertedBackupAppNames[0]).not.toBe("taken");
	});

	it("warns with NETWORK_UNRESOLVED when an application's networkId never resolved", async () => {
		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: {
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
				},
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: {},
			},
			resources: {
				project: { projectId: "project-1", name: "my-project" },
				environments: [{ environmentId: "env-1", name: "production" }],
				services: [
					{
						kind: "application",
						applicationId: "app-1",
						name: "my-app",
						appName: "my-app-abc123",
						environmentId: "env-1",
						networkIds: ["net-unresolved"],
					},
				],
				shared: {},
			},
			requirements: [],
			warnings: [],
			dumps: [],
		};

		const plan = {
			target: { kind: "newProject" as const, name: "imported" },
			resolutions: {},
			serverMap: {},
			appNameMap: { "my-app-abc123": "my-app-xyz789" },
			domainStrategy: { custom: "keep" as const },
			portsStrategy: "keep" as const,
			rotateDatabaseCredentials: false,
			conflicts: [],
			pendingServices: [],
			warnings: [],
			validation: [],
			summary: { counts: {}, domains: 0, dumps: 0 },
		};

		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				github: { findFirst: async () => undefined },
				gitlab: { findFirst: async () => undefined },
				gitea: { findFirst: async () => undefined },
				bitbucket: { findFirst: async () => undefined },
			},
			insert: () => ({
				values: (values: Record<string, unknown>) => ({
					returning: async () => [
						{
							...values,
							projectId: "new-project-1",
							environmentId: "new-env-1",
							applicationId: "new-app-1",
						},
					],
				}),
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		const result = await apply(writeDb, snapshot, plan, new Map(), "org-dest");

		const networkWarning = result.warnings.find(
			(w) => w.code === "NETWORK_UNRESOLVED",
		);
		expect(networkWarning).toBeDefined();
		expect(networkWarning?.message).toContain("1");
		expect(networkWarning?.affected).toContainEqual(
			expect.objectContaining({ serviceType: "application" }),
		);
	});
});

describe("apply restores captured dnsProvider settings (T-8.1)", () => {
	const minimalSnapshotWithDns = (
		dnsProviderRows: Record<string, unknown>[],
	): Snapshot => ({
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: {
				includeEnvSecrets: true,
				shared: { dnsProvider: "value" },
				files: {
					applicationSources: false,
					composeFiles: false,
					traefikRaw: false,
					customCertificates: false,
				},
				dumps: { mode: "none" },
				includeBackupSchedules: true,
			},
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: {},
		},
		resources: {
			project: { projectId: "project-1", name: "my-project" },
			environments: [],
			services: [],
			shared: { dnsProvider: dnsProviderRows },
		},
		requirements: [],
		warnings: [],
		dumps: [],
	});

	const basePlan = {
		target: { kind: "newProject" as const, name: "imported" },
		resolutions: {},
		serverMap: {},
		appNameMap: {},
		domainStrategy: { custom: "keep" as const },
		portsStrategy: "keep" as const,
		rotateDatabaseCredentials: false,
		conflicts: [],
		pendingServices: [],
		warnings: [],
		validation: [],
		summary: { counts: {}, domains: 0, dumps: 0 },
	};

	it("inserts a captured dnsProvider row into the destination org", async () => {
		const { dnsProvider: dnsProviderTable } = await import(
			"@dokploy/server/db/schema"
		);
		const snapshot = minimalSnapshotWithDns([
			{
				dnsProviderId: "dns-1",
				name: "cloudflare-main",
				providerType: "cloudflare",
				config: "$secret:dns-token-1",
			},
		]);
		const insertedDnsProviders: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				dnsProvider: { findFirst: async () => undefined },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						dnsProviderId: "new-dns-1",
					};
					if (table === dnsProviderTable) insertedDnsProviders.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		const secretsPlain = new Map([
			["dns-token-1", JSON.stringify({ apiToken: "real-cf-token" })],
		]);
		await apply(writeDb, snapshot, basePlan, secretsPlain, "org-dest");

		expect(insertedDnsProviders).toHaveLength(1);
		expect(insertedDnsProviders[0]?.name).toBe("cloudflare-main");
		expect(insertedDnsProviders[0]?.config).toEqual({
			apiToken: "real-cf-token",
		});
		expect(insertedDnsProviders[0]?.organizationId).toBe("org-dest");
	});

	it("skips inserting when a dnsProvider with the same name already exists in the destination org", async () => {
		const { dnsProvider: dnsProviderTable } = await import(
			"@dokploy/server/db/schema"
		);
		const snapshot = minimalSnapshotWithDns([
			{
				dnsProviderId: "dns-1",
				name: "cloudflare-main",
				providerType: "cloudflare",
				config: "$secret:dns-token-1",
			},
		]);
		const insertedDnsProviders: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				dnsProvider: {
					findFirst: async () => ({
						dnsProviderId: "existing-dns-1",
						name: "cloudflare-main",
						organizationId: "org-dest",
					}),
				},
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						dnsProviderId: "new-dns-1",
					};
					if (table === dnsProviderTable) insertedDnsProviders.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(
			writeDb,
			snapshot,
			basePlan,
			new Map([["dns-token-1", "real-cf-token"]]),
			"org-dest",
		);

		expect(insertedDnsProviders).toHaveLength(0);
	});
});

describe("apply resolves a service's ORIGINAL server via the requirement, not the (always-stripped) row (T-10.1)", () => {
	it("writes the destination server's id onto the imported application row, for a non-local source service", async () => {
		const remoteApplication = {
			applicationId: "app-remote-1",
			name: "remote-app",
			appName: "remote-app-abc123",
			environmentId: "env-1",
			env: "",
			buildArgs: null,
			buildSecrets: null,
			previewEnv: null,
			serverId: "server-src-1",
			buildServerId: null,
			githubId: null,
			gitlabId: null,
			giteaId: null,
			bitbucketId: null,
			refreshToken: null,
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
		const remoteProjectTree = {
			projectId: "project-remote-1",
			name: "remote-project",
			organizationId: "org-src",
			env: "",
			createdAt: "2024-01-01T00:00:00.000Z",
			environments: [
				{
					environmentId: "env-1",
					name: "production",
					projectId: "project-remote-1",
					env: "",
					isDefault: true,
					createdAt: "2024-01-01T00:00:00.000Z",
					applications: [remoteApplication],
					...emptyServiceArrays,
				},
			],
		};
		const db = {
			query: {
				projects: { findFirst: async () => remoteProjectTree },
				environments: { findFirst: async () => undefined },
				applications: {
					findMany: async () => [remoteApplication],
					findFirst: async () => undefined,
				},
				schedules: { findMany: async () => [] },
				volumeBackups: { findMany: async () => [] },
				vaultProvider: { findMany: async () => [] },
				registry: { findMany: async () => [] },
				destinations: { findMany: async () => [] },
				network: { findMany: async () => [] },
				certificates: { findMany: async () => [] },
				gitProvider: { findMany: async () => [] },
				server: {
					findMany: async () => [],
					findFirst: async () => ({ organizationId: "org-dest" }),
				},
				webServerSettings: { findFirst: async () => undefined },
				sshKeys: { findMany: async () => [] },
				domains: { findMany: async () => [] },
				ports: { findMany: async () => [] },
			},
		} as any as TransferDb;

		const captureResult = await capture(
			db,
			{ kind: "project", id: "project-remote-1" },
			baseScope,
			{
				detectRequirements: (tree, scope) =>
					detectRequirements(db, tree, scope),
				detectWarnings: (tree, scope) => detectWarnings(tree, scope),
			},
		);

		expect(
			(captureResult.resources.services[0] as Record<string, unknown>).serverId,
		).toBeUndefined();
		const serverRequirement = captureResult.requirements.find(
			(r) => r.kind === "server",
		);
		expect(serverRequirement?.originalId).toBe("server-src-1");

		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: baseScope,
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: captureResult.inventory.totals,
			},
			resources: captureResult.resources,
			requirements: captureResult.requirements,
			warnings: captureResult.warnings,
			dumps: [],
		};

		const serverKey = requirementKey(serverRequirement!);
		const plan = await buildPlan(
			db,
			snapshot,
			"org-dest",
			{
				kind: "newProject",
				name: "imported-project",
			},
			{
				resolutions: {
					[serverKey]: {
						requirementKey: serverKey,
						action: "reuse",
						targetId: "server-dest-1",
					},
				},
			},
		);
		expect(plan.serverMap["server-src-1"]).toBe("server-dest-1");

		const insertedByTable = new Map<unknown, Record<string, unknown>[]>();
		const environmentsTable = (await import("@dokploy/server/db/schema"))
			.environments;
		const idFieldByTable = new Map<unknown, string>([
			[projects, "projectId"],
			[environmentsTable, "environmentId"],
			[applications, "applicationId"],
		]);
		const writeDb = {
			query: {
				server: {
					findFirst: async () => ({
						serverId: "server-dest-1",
						organizationId: "org-dest",
					}),
				},
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				github: { findFirst: async () => undefined },
				gitlab: { findFirst: async () => undefined },
				gitea: { findFirst: async () => undefined },
				bitbucket: { findFirst: async () => undefined },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const idField = idFieldByTable.get(table);
					const row = { ...values };
					if (idField) {
						row[idField] =
							(values[idField] as string | undefined) ?? `new-${idField}-1`;
					}
					const list = insertedByTable.get(table) ?? [];
					list.push(row);
					insertedByTable.set(table, list);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(
			writeDb,
			snapshot,
			plan,
			captureResult.secretsPlain,
			"org-dest",
		);

		const insertedApp = (insertedByTable.get(applications) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedApp.serverId).toBe("server-dest-1");
	});
});

describe("apply resolves application.buildServerId via its own requirement (T-10.6)", () => {
	it("writes the destination build server's id onto the imported application row", async () => {
		const remoteBuildApplication = {
			applicationId: "app-remote-build-1",
			name: "remote-build-app",
			appName: "remote-build-app-abc123",
			environmentId: "env-1",
			env: "",
			buildArgs: null,
			buildSecrets: null,
			previewEnv: null,
			serverId: null,
			buildServerId: "server-build-src-1",
			githubId: null,
			gitlabId: null,
			giteaId: null,
			bitbucketId: null,
			refreshToken: null,
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
		const remoteProjectTree = {
			projectId: "project-remote-build-1",
			name: "remote-build-project",
			organizationId: "org-src",
			env: "",
			createdAt: "2024-01-01T00:00:00.000Z",
			environments: [
				{
					environmentId: "env-1",
					name: "production",
					projectId: "project-remote-build-1",
					env: "",
					isDefault: true,
					createdAt: "2024-01-01T00:00:00.000Z",
					applications: [remoteBuildApplication],
					...emptyServiceArrays,
				},
			],
		};
		const db = {
			query: {
				projects: { findFirst: async () => remoteProjectTree },
				environments: { findFirst: async () => undefined },
				applications: {
					findMany: async () => [remoteBuildApplication],
					findFirst: async () => undefined,
				},
				schedules: { findMany: async () => [] },
				volumeBackups: { findMany: async () => [] },
				vaultProvider: { findMany: async () => [] },
				registry: { findMany: async () => [] },
				destinations: { findMany: async () => [] },
				network: { findMany: async () => [] },
				certificates: { findMany: async () => [] },
				gitProvider: { findMany: async () => [] },
				server: {
					findMany: async () => [],
					findFirst: async () => ({ organizationId: "org-dest" }),
				},
				webServerSettings: { findFirst: async () => undefined },
				sshKeys: { findMany: async () => [] },
				domains: { findMany: async () => [] },
				ports: { findMany: async () => [] },
			},
		} as any as TransferDb;

		const captureResult = await capture(
			db,
			{ kind: "project", id: "project-remote-build-1" },
			baseScope,
			{
				detectRequirements: (tree, scope) =>
					detectRequirements(db, tree, scope),
				detectWarnings: (tree, scope) => detectWarnings(tree, scope),
			},
		);

		expect(
			(captureResult.resources.services[0] as Record<string, unknown>)
				.buildServerId,
		).toBeUndefined();
		const serverRequirement = captureResult.requirements.find(
			(r) => r.kind === "server" && r.originalId === "server-build-src-1",
		);
		expect(serverRequirement?.usedBy[0]?.field).toBe("buildServerId");

		const snapshot: Snapshot = {
			manifest: {
				format: "dokploy-project-export",
				formatVersion: 1,
				exportedAt: "2024-01-01T00:00:00.000Z",
				exportedBy: { userId: "user-1", email: "a@b.com" },
				sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
				scope: baseScope,
				crypto: {
					salt: "c2FsdA==",
					kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
					keyCheck: "{}",
				},
				counts: captureResult.inventory.totals,
			},
			resources: captureResult.resources,
			requirements: captureResult.requirements,
			warnings: captureResult.warnings,
			dumps: [],
		};

		const serverKey = requirementKey(serverRequirement!);
		const plan = await buildPlan(
			db,
			snapshot,
			"org-dest",
			{
				kind: "newProject",
				name: "imported-project",
			},
			{
				resolutions: {
					[serverKey]: {
						requirementKey: serverKey,
						action: "reuse",
						targetId: "server-build-dest-1",
					},
				},
			},
		);
		expect(plan.serverMap["server-build-src-1"]).toBe("server-build-dest-1");

		const insertedByTable = new Map<unknown, Record<string, unknown>[]>();
		const environmentsTable = (await import("@dokploy/server/db/schema"))
			.environments;
		const idFieldByTable = new Map<unknown, string>([
			[projects, "projectId"],
			[environmentsTable, "environmentId"],
			[applications, "applicationId"],
		]);
		const writeDb = {
			query: {
				server: {
					findFirst: async () => ({
						serverId: "server-build-dest-1",
						organizationId: "org-dest",
					}),
				},
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
				github: { findFirst: async () => undefined },
				gitlab: { findFirst: async () => undefined },
				gitea: { findFirst: async () => undefined },
				bitbucket: { findFirst: async () => undefined },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const idField = idFieldByTable.get(table);
					const row = { ...values };
					if (idField) {
						row[idField] =
							(values[idField] as string | undefined) ?? `new-${idField}-1`;
					}
					const list = insertedByTable.get(table) ?? [];
					list.push(row);
					insertedByTable.set(table, list);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(
			writeDb,
			snapshot,
			plan,
			captureResult.secretsPlain,
			"org-dest",
		);

		const insertedApp = (insertedByTable.get(applications) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedApp.buildServerId).toBe("server-build-dest-1");
		expect(insertedApp.serverId).toBeFalsy();
	});
});

describe("apply regenerates a compose's pinned suffix instead of reusing the source's (T-11.6)", () => {
	const baseComposeSnapshot = (suffix: string): Snapshot => ({
		manifest: {
			format: "dokploy-project-export",
			formatVersion: 1,
			exportedAt: "2024-01-01T00:00:00.000Z",
			exportedBy: { userId: "user-1", email: "a@b.com" },
			sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-src" },
			scope: {
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
			},
			crypto: {
				salt: "c2FsdA==",
				kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
				keyCheck: "{}",
			},
			counts: {},
		},
		resources: {
			project: { projectId: "project-1", name: "my-project" },
			environments: [{ environmentId: "env-1", name: "production" }],
			services: [
				{
					kind: "compose",
					composeId: "compose-1",
					name: "my-compose",
					appName: "my-compose-abc123",
					environmentId: "env-1",
					suffix,
				},
			],
			shared: {},
		},
		requirements: [],
		warnings: [],
		dumps: [],
	});

	const basePlan = {
		target: { kind: "newProject" as const, name: "imported" },
		resolutions: {},
		serverMap: {},
		appNameMap: { "my-compose-abc123": "my-compose-xyz789" },
		domainStrategy: { custom: "keep" as const },
		portsStrategy: "keep" as const,
		rotateDatabaseCredentials: false,
		conflicts: [],
		pendingServices: [],
		warnings: [],
		validation: [],
		summary: { counts: {}, domains: 0, dumps: 0 },
	};

	const runApplyTrackingCompose = async (snapshot: Snapshot) => {
		const { compose: composeTable } = await import("@dokploy/server/db/schema");
		const insertedCompose: Record<string, unknown>[] = [];
		const writeDb = {
			query: {
				server: { findFirst: async () => undefined },
				webServerSettings: { findFirst: async () => undefined },
				mounts: { findMany: async () => [] },
			},
			insert: (table: unknown) => ({
				values: (values: Record<string, unknown>) => {
					const row = {
						...values,
						projectId: "new-project-1",
						environmentId: "new-env-1",
						composeId: "new-compose-1",
					};
					if (table === composeTable) insertedCompose.push(row);
					return { returning: async () => [row] };
				},
			}),
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
				fn({ ...writeDb }),
		} as any as TransferWriteDb;

		await apply(writeDb, snapshot, basePlan, new Map(), "org-dest");
		return insertedCompose;
	};

	it("generates a fresh suffix instead of reusing the source's pinned one", async () => {
		const insertedCompose = await runApplyTrackingCompose(
			baseComposeSnapshot("ab12cd"),
		);
		expect(insertedCompose).toHaveLength(1);
		expect(insertedCompose[0]?.suffix).not.toBe("ab12cd");
		expect(insertedCompose[0]?.suffix).toMatch(/^[a-f0-9]+$/);
	});

	it("leaves an empty suffix empty (already randomizes fresh on every deploy)", async () => {
		const insertedCompose = await runApplyTrackingCompose(
			baseComposeSnapshot(""),
		);
		expect(insertedCompose[0]?.suffix).toBe("");
	});
});
