import type {
	Plan,
	Requirement,
	Snapshot,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import { ExecError } from "@dokploy/server/utils/process/execAsync";
import { describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsyncRemote: vi.fn(async () => ({ stdout: "", stderr: "" })),
	};
});

vi.mock("@dokploy/server/services/registry", () => ({
	testRegistryConnection: vi.fn(async () => {
		throw new ExecError(
			"Command execution failed: Command failed: printf %s 'realregistrypass123' | docker login registry.example.com -u user --password-stdin",
			{
				command:
					"printf %s 'realregistrypass123' | docker login registry.example.com -u user --password-stdin",
				stderr: "Error response from daemon: login attempt failed",
				exitCode: 1,
			},
		);
	}),
}));

vi.mock("@dokploy/server/services/destination", () => ({
	testDestinationConnection: vi.fn(async () => {
		throw new ExecError(
			"Command execution failed: Command failed: rclone ls --s3-secret-access-key=realsecretkey456 :s3:mybucket",
			{
				command:
					"rclone ls --s3-secret-access-key=realsecretkey456 :s3:mybucket",
				stderr: "NoSuchBucket: The specified bucket does not exist",
				exitCode: 1,
			},
		);
	}),
}));

vi.mock("@dokploy/server/services/vault-provider", () => ({
	testVaultProviderConnection: vi.fn(async () => {}),
}));

const { validatePlan } = await import(
	"@dokploy/server/services/project-export-import"
);

const basePlan = {
	target: { kind: "newProject" as const, name: "imported" },
	resolutions: {
		"registry:registry-src": {
			requirementKey: "registry:registry-src",
			action: "reuse" as const,
			targetId: "registry-dest-1",
		},
		"destination:destination-src": {
			requirementKey: "destination:destination-src",
			action: "reuse" as const,
			targetId: "destination-dest-1",
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
} satisfies Plan;

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
		project: {},
		environments: [],
		services: [],
		shared: {},
	},
	requirements: [],
	warnings: [],
	dumps: [],
};

const fakeDb = {
	query: {
		registry: {
			findFirst: async () => ({
				registryId: "registry-dest-1",
				registryUrl: "registry.example.com",
				username: "user",
				password: "realregistrypass123",
				organizationId: "org-dest",
			}),
		},
		destinations: {
			findFirst: async () => ({
				destinationId: "destination-dest-1",
				accessKey: "key",
				secretAccessKey: "realsecretkey456",
				bucket: "mybucket",
				region: "us-east-1",
				endpoint: "https://s3.example.com",
				organizationId: "org-dest",
			}),
		},
		vaultProvider: { findFirst: async () => undefined },
	},
} as any as TransferDb;

describe("validatePlan (T-5.4)", () => {
	it("never leaks the registry password or destination secretAccessKey into a failed check's detail", async () => {
		const checks = await validatePlan(fakeDb, snapshot, basePlan, "org-dest");

		const registryCheck = checks.find((c) => c.check.startsWith("registry:"));
		expect(registryCheck?.ok).toBe(false);
		expect(registryCheck?.detail).not.toContain("realregistrypass123");
		expect(registryCheck?.detail).toContain("login attempt failed");

		const destinationCheck = checks.find((c) =>
			c.check.startsWith("destination:"),
		);
		expect(destinationCheck?.ok).toBe(false);
		expect(destinationCheck?.detail).not.toContain("realsecretkey456");
		expect(destinationCheck?.detail).toContain("bucket does not exist");
	});
});

describe("validatePlan checks each appName against its own destination server (T-5.13)", () => {
	it("probes two services' appNames against their own distinct destination servers, not the same one for both", async () => {
		const snapshotWithTwoApps: Snapshot = {
			...snapshot,
			resources: {
				...snapshot.resources,
				services: [
					{
						kind: "application",
						applicationId: "app-1",
						appName: "app-one-old",
						serverId: "server-src-1",
					},
					{
						kind: "application",
						applicationId: "app-2",
						appName: "app-two-old",
						serverId: "server-src-2",
					},
				],
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
							serviceName: "app-one",
							environmentId: "env-1",
							field: "serverId",
						},
					],
				},
				{
					kind: "server",
					originalId: "server-src-2",
					configIncluded: false,
					usedBy: [
						{
							serviceId: "app-2",
							serviceType: "application",
							serviceName: "app-two",
							environmentId: "env-1",
							field: "serverId",
						},
					],
				},
			],
		};
		const planWithTwoApps: Plan = {
			...basePlan,
			resolutions: {},
			serverMap: {
				"server-src-1": "server-dest-1",
				"server-src-2": "server-dest-2",
			},
			appNameMap: {
				"app-one-old": "app-one-new",
				"app-two-old": "app-two-new",
			},
		};

		const probed: { appName: string; serverId: string | null }[] = [];
		await validatePlan(
			fakeDb,
			snapshotWithTwoApps,
			planWithTwoApps,
			"org-dest",
			{
				checkAppNameAvailable: async (appName, serverId) => {
					probed.push({ appName, serverId });
					return true;
				},
			},
		);

		expect(probed).toContainEqual({
			appName: "app-one-new",
			serverId: "server-dest-1",
		});
		expect(probed).toContainEqual({
			appName: "app-two-new",
			serverId: "server-dest-2",
		});
	});
});

describe("validatePlan blocks an unresolved server requirement (T-6.9)", () => {
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

	it("fails the check when the server requirement's resolution is 'skip'", async () => {
		const snapshotWithServer: Snapshot = {
			...snapshot,
			requirements: [serverRequirement],
		};
		const planWithSkippedServer: Plan = {
			...basePlan,
			resolutions: {
				"server:server-src-1": {
					requirementKey: "server:server-src-1",
					action: "skip",
				},
			},
		};

		const checks = await validatePlan(
			fakeDb,
			snapshotWithServer,
			planWithSkippedServer,
			"org-dest",
		);

		const serverCheck = checks.find(
			(c) => c.check === "serverResolution:server-src-1",
		);
		expect(serverCheck?.ok).toBe(false);
	});

	it("fails the check when the server requirement has no resolution at all", async () => {
		const snapshotWithServer: Snapshot = {
			...snapshot,
			requirements: [serverRequirement],
		};
		const planWithNoResolution: Plan = {
			...basePlan,
			resolutions: {},
		};

		const checks = await validatePlan(
			fakeDb,
			snapshotWithServer,
			planWithNoResolution,
			"org-dest",
		);

		const serverCheck = checks.find(
			(c) => c.check === "serverResolution:server-src-1",
		);
		expect(serverCheck?.ok).toBe(false);
	});

	it("passes the check when the server requirement is resolved (reuse, incl. explicit local)", async () => {
		const snapshotWithServer: Snapshot = {
			...snapshot,
			requirements: [serverRequirement],
		};
		const planResolved: Plan = {
			...basePlan,
			resolutions: {
				"server:server-src-1": {
					requirementKey: "server:server-src-1",
					action: "reuse",
					targetId: "server-dest-1",
				},
			},
		};

		const checks = await validatePlan(
			fakeDb,
			snapshotWithServer,
			planResolved,
			"org-dest",
		);

		const serverCheck = checks.find(
			(c) => c.check === "serverResolution:server-src-1",
		);
		expect(serverCheck?.ok).toBe(true);
	});
});

describe("validatePlan checks vault/registry/destination reuse targets belong to the caller's org (T-6.12)", () => {
	const crossOrgDb = {
		query: {
			vaultProvider: {
				findFirst: async () => ({
					vaultProviderId: "vault-dest-1",
					config: {
						providerType: "hashicorp",
						url: "https://vault",
						token: "t",
					},
					organizationId: "org-OTHER",
				}),
			},
			registry: {
				findFirst: async () => ({
					registryId: "registry-dest-1",
					registryUrl: "registry.example.com",
					username: "user",
					password: "realregistrypass123",
					organizationId: "org-OTHER",
				}),
			},
			destinations: {
				findFirst: async () => ({
					destinationId: "destination-dest-1",
					accessKey: "key",
					secretAccessKey: "realsecretkey456",
					bucket: "mybucket",
					region: "us-east-1",
					endpoint: "https://s3.example.com",
					organizationId: "org-OTHER",
				}),
			},
		},
	} as any as TransferDb;

	it("fails the registry/destination checks without ever calling the live connection test, when the resolved row belongs to another org", async () => {
		const { testRegistryConnection } = await import(
			"@dokploy/server/services/registry"
		);
		const { testDestinationConnection } = await import(
			"@dokploy/server/services/destination"
		);
		(testRegistryConnection as any).mockClear();
		(testDestinationConnection as any).mockClear();

		const checks = await validatePlan(
			crossOrgDb,
			snapshot,
			basePlan,
			"org-dest",
		);

		const registryCheck = checks.find((c) => c.check.startsWith("registry:"));
		expect(registryCheck?.ok).toBe(false);
		expect(registryCheck?.detail).toContain("Not found in this organization");
		expect(testRegistryConnection).not.toHaveBeenCalled();

		const destinationCheck = checks.find((c) =>
			c.check.startsWith("destination:"),
		);
		expect(destinationCheck?.ok).toBe(false);
		expect(destinationCheck?.detail).toContain(
			"Not found in this organization",
		);
		expect(testDestinationConnection).not.toHaveBeenCalled();
	});

	it("fails the vault check without calling testVaultProviderConnection, when the resolved row belongs to another org", async () => {
		const { testVaultProviderConnection } = await import(
			"@dokploy/server/services/vault-provider"
		);
		(testVaultProviderConnection as any).mockClear();

		const planWithVault: Plan = {
			...basePlan,
			resolutions: {
				"vault:vault-src": {
					requirementKey: "vault:vault-src",
					action: "reuse",
					targetId: "vault-dest-1",
				},
			},
		};

		const checks = await validatePlan(
			crossOrgDb,
			snapshot,
			planWithVault,
			"org-dest",
		);

		const vaultCheck = checks.find((c) => c.check.startsWith("vault:"));
		expect(vaultCheck?.ok).toBe(false);
		expect(vaultCheck?.detail).toContain("Not found in this organization");
		expect(testVaultProviderConnection).not.toHaveBeenCalled();
	});
});

describe("validatePlan checks that each server in plan.serverMap belongs to the caller's org (T-9.3)", () => {
	it("fails the check without ever calling execAsyncRemote, for a server belonging to another org", async () => {
		const { execAsyncRemote } = await import(
			"@dokploy/server/utils/process/execAsync"
		);
		(execAsyncRemote as any).mockClear();

		const crossOrgServerDb = {
			query: {
				...(fakeDb as any).query,
				server: {
					findFirst: async () => ({
						serverId: "server-other-org",
						organizationId: "org-OTHER",
					}),
				},
			},
		} as any as TransferDb;

		const planWithServer: Plan = {
			...basePlan,
			resolutions: {},
			serverMap: { "server-src-1": "server-other-org" },
		};

		const checks = await validatePlan(
			crossOrgServerDb,
			snapshot,
			planWithServer,
			"org-dest",
		);

		const serverCheck = checks.find(
			(c) => c.check === "server:server-other-org",
		);
		expect(serverCheck?.ok).toBe(false);
		expect(serverCheck?.detail).toContain("Not found in this organization");
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});
});

describe("validatePlan fails the check when a reuse target no longer exists (T-9.4)", () => {
	it("fails the registry check (not ok:true) when the target row doesn't exist at all", async () => {
		const missingRowDb = {
			query: {
				...(fakeDb as any).query,
				registry: { findFirst: async () => undefined },
			},
		} as any as TransferDb;

		const checks = await validatePlan(
			missingRowDb,
			snapshot,
			basePlan,
			"org-dest",
		);

		const registryCheck = checks.find((c) => c.check.startsWith("registry:"));
		expect(registryCheck?.ok).toBe(false);
		expect(registryCheck?.detail).toContain("Not found in this organization");
	});
});
