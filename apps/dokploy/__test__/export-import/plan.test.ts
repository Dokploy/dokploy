import type {
	Requirement,
	Snapshot,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	buildPlan,
	requirementKey,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const vaultRequirement: Requirement = {
	kind: "vault",
	originalId: "vault-src",
	configIncluded: false,
	usedBy: [
		{
			serviceId: "app-1",
			serviceType: "application",
			serviceName: "my-app",
			environmentId: "env-1",
		},
	],
	providerName: "prod",
	providerType: "hashicorp",
	secretKeys: ["DB_PASS"],
};

const networkRequirement: Requirement = {
	kind: "network",
	originalId: "net-src",
	configIncluded: true,
	usedBy: [
		{
			serviceId: "app-1",
			serviceType: "application",
			serviceName: "my-app",
			environmentId: "env-1",
		},
	],
	name: "shared-net",
};

const serverRequirement: Requirement = {
	kind: "server",
	originalId: "server-src-1",
	configIncluded: false,
	usedBy: [
		{
			serviceId: "app-1",
			serviceType: "application",
			serviceName: "my-app",
			environmentId: "env-1",
		},
	],
};

const applicationService: Record<string, unknown> = {
	kind: "application",
	applicationId: "app-1",
	name: "my-app",
	appName: "my-app-abc123",
	environmentId: "env-1",
	serverId: "server-src-1",
	domains: [{ domainId: "dom-1", host: "existing.example.com" }],
	ports: [{ portId: "port-src-1", publishedPort: 8080 }],
};

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
				applicationSources: true,
				composeFiles: true,
				traefikRaw: true,
				customCertificates: true,
			},
			dumps: { mode: "none" },
			includeBackupSchedules: true,
		},
		crypto: {
			salt: "c2FsdA==",
			kdfParams: { N: 32768, r: 8, p: 1, dkLen: 64 },
			keyCheck: "{}",
		},
		counts: { application: 1 },
	},
	resources: {
		project: { projectId: "project-1", name: "my-project" },
		environments: [{ environmentId: "env-1", name: "production" }],
		services: [applicationService],
		shared: {},
	},
	requirements: [vaultRequirement, networkRequirement, serverRequirement],
	warnings: [],
	dumps: [],
};

const fakeDb = (): TransferDb =>
	({
		query: {
			vaultProvider: { findMany: async () => [] },
			network: {
				findMany: async () => [],
				findFirst: async () => ({
					networkId: "net-dest-existing",
					name: "shared-net",
					organizationId: "org-dest",
				}),
			},
			server: {
				findMany: async () => [
					{
						serverId: "server-dest-1",
						name: "prod",
						organizationId: "org-dest",
					},
				],
				findFirst: async () => ({ organizationId: "org-dest" }),
			},
			webServerSettings: { findFirst: async () => undefined },
			projects: {
				findFirst: async () => ({
					projectId: "project-existing",
					name: "my-project",
					organizationId: "org-dest",
				}),
			},
			domains: {
				findMany: async () => [
					{ domainId: "dom-existing-1", host: "existing.example.com" },
				],
			},
			ports: {
				findMany: async () => [
					{
						portId: "port-existing-1",
						publishedPort: 8080,
						application: { serverId: "server-dest-1" },
					},
				],
			},
		},
	}) as any as TransferDb;

describe("buildPlan", () => {
	it("marks a missing vault requirement's services as pending, with a blocking warning", async () => {
		const plan = await buildPlan(
			fakeDb(),
			snapshot,
			"org-dest",
			{ kind: "newProject", name: "my-project" },
			{
				resolutions: {
					[requirementKey(serverRequirement)]: {
						requirementKey: requirementKey(serverRequirement),
						action: "reuse",
						targetId: "server-dest-1",
					},
				},
			},
		);

		expect(plan.resolutions[requirementKey(vaultRequirement)]).toEqual({
			requirementKey: requirementKey(vaultRequirement),
			action: "skip",
		});
		expect(plan.pendingServices).toEqual([
			{
				serviceId: "app-1",
				serviceType: "application",
				reason: 'Missing vault "prod"',
			},
		]);
		expect(
			plan.warnings.some(
				(w) =>
					w.code === "MISSING_REQUIREMENT_BLOCKING" &&
					w.severity === "blocking",
			),
		).toBe(true);
	});

	it("flags an existing host as a domain conflict", async () => {
		const plan = await buildPlan(fakeDb(), snapshot, "org-dest", {
			kind: "newProject",
			name: "my-project",
		});
		expect(plan.conflicts).toContainEqual(
			expect.objectContaining({
				kind: "domain",
				value: "existing.example.com",
				existingId: "dom-existing-1",
			}),
		);
	});

	it("flags an existing project name as a conflict with a suggested rename option", async () => {
		const plan = await buildPlan(fakeDb(), snapshot, "org-dest", {
			kind: "newProject",
			name: "my-project",
		});
		expect(plan.conflicts).toContainEqual({
			kind: "projectName",
			value: "my-project",
			existingId: "project-existing",
			usedBy: [],
			options: ["rename"],
		});
		expect(plan.conflictResolutions?.["projectName:my-project"]).toEqual({
			action: "rename",
			value: "my-project (imported)",
		});
	});

	it("flags a network conflict only when the requirement's resolution is 'create'", async () => {
		const plan = await buildPlan(fakeDb(), snapshot, "org-dest", {
			kind: "newProject",
			name: "my-project",
		});
		expect(plan.resolutions[requirementKey(networkRequirement)]?.action).toBe(
			"create",
		);
		expect(plan.conflicts).toContainEqual(
			expect.objectContaining({ kind: "network", value: "shared-net" }),
		);
	});

	it("flags a port conflict on the destination server the service resolves to", async () => {
		const plan = await buildPlan(
			fakeDb(),
			snapshot,
			"org-dest",
			{ kind: "newProject", name: "my-project" },
			{
				resolutions: {
					[requirementKey(serverRequirement)]: {
						requirementKey: requirementKey(serverRequirement),
						action: "reuse",
						targetId: "server-dest-1",
					},
				},
			},
		);
		expect(plan.serverMap["server-src-1"]).toBe("server-dest-1");
		expect(plan.conflicts).toContainEqual(
			expect.objectContaining({ kind: "port", value: "8080" }),
		);
	});

	it("regenerates app names by default, and keeps the original when keepAppNames is set and available", async () => {
		const regenerated = await buildPlan(fakeDb(), snapshot, "org-dest", {
			kind: "newProject",
			name: "my-project",
		});
		expect(regenerated.appNameMap["my-app-abc123"]).not.toBe("my-app-abc123");

		const kept = await buildPlan(
			fakeDb(),
			snapshot,
			"org-dest",
			{ kind: "newProject", name: "my-project" },
			{
				keepAppNames: true,
				checkAppNameAvailable: async () => true,
			},
		);
		expect(kept.appNameMap["my-app-abc123"]).toBe("my-app-abc123");
	});

	it("retries appName generation against the DB on a simulated collision", async () => {
		let findFirstCalls = 0;
		const db = {
			...fakeDb(),
			query: {
				...(fakeDb() as any).query,
				applications: {
					findFirst: async () => {
						findFirstCalls += 1;
						return findFirstCalls <= 2
							? { applicationId: "app-taken", appName: "whatever" }
							: undefined;
					},
				},
			},
		} as any as TransferDb;

		const plan = await buildPlan(db, snapshot, "org-dest", {
			kind: "newProject",
			name: "my-project",
		});

		expect(findFirstCalls).toBeGreaterThanOrEqual(3);
		expect(plan.appNameMap["my-app-abc123"]).toBeDefined();
		expect(plan.appNameMap["my-app-abc123"]).not.toBe("my-app-abc123");
	});

	it("gives up after MAX_APP_NAME_RETRIES consecutive collisions instead of looping forever", async () => {
		const db = {
			...fakeDb(),
			query: {
				...(fakeDb() as any).query,
				applications: {
					findFirst: async () => ({
						applicationId: "app-taken",
						appName: "whatever",
					}),
				},
			},
		} as any as TransferDb;

		await expect(
			buildPlan(db, snapshot, "org-dest", {
				kind: "newProject",
				name: "my-project",
			}),
		).rejects.toThrow(/unique appName/i);
	});

	it("excludes redis from the dump count summary (it has no dump support)", async () => {
		const dumpSnapshot: Snapshot = {
			...snapshot,
			manifest: {
				...snapshot.manifest,
				scope: {
					...snapshot.manifest.scope,
					dumps: { mode: "embed" },
				},
			},
			resources: {
				...snapshot.resources,
				services: [
					applicationService,
					{
						kind: "postgres",
						postgresId: "pg-1",
						name: "my-db",
						appName: "my-db-abc123",
						environmentId: "env-1",
					},
					{
						kind: "redis",
						redisId: "redis-1",
						name: "my-cache",
						appName: "my-cache-abc123",
						environmentId: "env-1",
					},
				],
			},
			requirements: [],
		};

		const plan = await buildPlan(fakeDb(), dumpSnapshot, "org-dest", {
			kind: "newProject",
			name: "my-project",
		});

		expect(plan.summary.dumps).toBe(1);
	});
});
