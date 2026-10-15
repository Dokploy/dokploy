import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	applications,
	compose,
	domains,
	mounts,
	ports,
	projects,
	registry,
	schedules,
	security,
} from "@dokploy/server/db/schema";
import type {
	ExportScope,
	TransferDb,
	TransferWriteDb,
} from "@dokploy/server/services/project-export-import";
import {
	apply,
	buildPlan,
	capture,
	detectRequirements,
	detectWarnings,
	inspectBundle,
	LOCAL_SERVER_CANDIDATE_ID,
	serialize,
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

const composeService = {
	composeId: "compose-1",
	name: "my-compose",
	appName: "my-compose-def456",
	environmentId: "env-1",
	env: "",
	serverId: null,
	composeFile: "services:\n  web:\n    image: nginx\n",
	sourceType: "raw",
	composeType: "docker-compose",
	createdAt: "2024-01-01T00:00:00.000Z",
	domains: [],
	mounts: [],
	backups: [],
	schedules: [
		{
			scheduleId: "schedule-1",
			name: "nightly-restart",
			cronExpression: "0 0 * * *",
			shellType: "bash",
			scheduleType: "compose",
			command: "docker compose restart",
			createdAt: "2024-01-01T00:00:00.000Z",
		},
	],
	volumeBackups: [],
};

const emptyServiceArrays = {
	postgres: [],
	mysql: [],
	mariadb: [],
	mongo: [],
	redis: [],
	libsql: [],
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
			compose: [composeService],
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
					registryId: "registry-src-1",
					registryName: "Acme",
					registryUrl: "https://registry.example.com",
					imagePrefix: "acme",
					username: "user",
					password: "pass",
					organizationId: "org-src",
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

let workDir: string;
let outDir: string;
let extractDir: string;

beforeEach(async () => {
	workDir = await mkdtemp(join(tmpdir(), "transfer-roundtrip-work-"));
	outDir = await mkdtemp(join(tmpdir(), "transfer-roundtrip-out-"));
	extractDir = await mkdtemp(join(tmpdir(), "transfer-roundtrip-extract-"));
});

afterEach(async () => {
	await rm(workDir, { recursive: true, force: true });
	await rm(outDir, { recursive: true, force: true });
	await rm(extractDir, { recursive: true, force: true });
});

describe("transfer roundtrip: capture -> serialize -> deserialize -> plan -> apply", () => {
	it("re-creates the project with equivalent values, remapped ids/appNames/serverId, and no plaintext secrets anywhere along the way", async () => {
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

		const bundlePath = join(outDir, "bundle.dokploy.tar.gz");
		await serialize(
			{
				resources: captureResult.resources,
				inventory: captureResult.inventory,
				requirements: captureResult.requirements,
				warnings: captureResult.warnings,
				dumps: [],
				scope: baseScope,
				organizationId: "org-src",
				dokployVersion: "1.0.0-test",
				exportedBy: { userId: "user-1", email: "a@b.com" },
			},
			captureResult.secretsPlain,
			PASSPHRASE,
			local(workDir),
			local(bundlePath),
		);

		await inspectBundle(local(bundlePath), local(extractDir));
		const unlocked = await unlockBundle(local(extractDir), PASSPHRASE);

		const plan = await buildPlan(
			db,
			unlocked.snapshot,
			"org-dest",
			{ kind: "newProject", name: "imported-project" },
			{
				resolutions: {
					"server:null": {
						requirementKey: "server:null",
						action: "reuse",
						targetId: LOCAL_SERVER_CANDIDATE_ID,
					},
				},
			},
		);
		expect(
			plan.resolutions[
				Object.keys(plan.resolutions).find((k) => k.startsWith("vault:"))!
			]?.action,
		).toBe("reuse");
		expect(
			plan.resolutions[
				Object.keys(plan.resolutions).find((k) => k.startsWith("registry:"))!
			]?.action,
		).toBe("reuse");
		expect(plan.pendingServices).toEqual([]);

		const insertedByTable = new Map<unknown, Record<string, unknown>[]>();
		let counter = 0;
		const idFieldByTable = new Map<unknown, string>([
			[projects, "projectId"],
			[applications, "applicationId"],
			[compose, "composeId"],
			[domains, "domainId"],
			[mounts, "mountId"],
			[ports, "portId"],
			[security, "securityId"],
			[registry, "registryId"],
			[schedules, "scheduleId"],
		]);
		const environmentsTable = (await import("@dokploy/server/db/schema"))
			.environments;
		idFieldByTable.set(environmentsTable, "environmentId");

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
			update: () => ({ set: () => ({ where: async () => {} }) }),
			transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
				const tx = { ...writeDb };
				return fn(tx);
			},
		} as any as TransferWriteDb;

		const result = await apply(
			writeDb,
			unlocked.snapshot,
			plan,
			unlocked.secretsPlain,
			"org-dest",
		);

		const projectRow = (insertedByTable.get(projects) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(projectRow.projectId).not.toBe("project-1");
		// The shared fake db also reports "imported-project" as an existing project, so the name conflict is auto-renamed.
		expect(projectRow.name).toBe("imported-project (imported)");
		expect(result.idMap.project?.["project-1"]).toBe(projectRow.projectId);

		const insertedApp = (insertedByTable.get(applications) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedApp.applicationId).not.toBe("app-1");
		expect(insertedApp.appName).not.toBe("my-app-abc123");
		expect(insertedApp.env).toBe(
			"DB_PASS=${{vault.prod.DB_PASS}}\nAPI_TOKEN=abc123token",
		);
		expect(insertedApp.registryId).toBe("registry-src-1");
		expect(insertedByTable.get(registry) ?? []).toHaveLength(0);

		const insertedCompose = (insertedByTable.get(compose) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedCompose.composeId).not.toBe("compose-1");
		expect(insertedCompose.appName).not.toBe("my-compose-def456");
		expect(insertedCompose.composeFile).toBe(composeService.composeFile);

		const insertedSchedule = (insertedByTable.get(schedules) ?? [])[0] as
			| Record<string, unknown>
			| undefined;
		expect(insertedSchedule?.composeId).toBe(insertedCompose.composeId);
		expect(insertedSchedule?.organizationId).toBe("org-dest");

		const insertedDomain = (insertedByTable.get(domains) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedDomain.host).toBe("app-1.example.com");
		expect(insertedDomain.applicationId).toBe(insertedApp.applicationId);

		const insertedMount = (insertedByTable.get(mounts) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedMount.content).toBe("server { listen 80; }");

		const insertedSecurity = (insertedByTable.get(security) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedSecurity.password).toBe("basicauthpass");

		const insertedPort = (insertedByTable.get(ports) ?? [])[0] as Record<
			string,
			unknown
		>;
		expect(insertedPort.publishedPort).toBe(8080);

		const serializedInserts = JSON.stringify([...insertedByTable.values()]);
		expect(serializedInserts).not.toContain("$secret:");
		expect(serializedInserts).not.toContain("webhook-token");
	}, 30_000);
});
