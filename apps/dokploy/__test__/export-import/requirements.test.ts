import type {
	ExportScope,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import { detectRequirements } from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

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

const baseApplication = {
	applicationId: "app-1",
	name: "app-1",
	env: "",
	buildArgs: null,
	buildSecrets: null,
	previewEnv: null,
	serverId: null,
	buildServerId: null,
	githubId: null,
	gitlabId: null,
	giteaId: null,
	bitbucketId: null,
	owner: null,
	repository: null,
	registryId: null,
	buildRegistryId: null,
	rollbackRegistryId: null,
	customGitSSHKeyId: null,
	customGitSSHKey: null,
	networkIds: [],
	domains: [],
	backups: undefined,
	volumeBackups: [],
};

const emptyServiceArrays = {
	compose: [],
	mysql: [],
	mariadb: [],
	mongo: [],
	redis: [],
	libsql: [],
};

const buildTree = (application: Record<string, unknown>) => ({
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-1",
	env: "",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			env: "",
			applications: [application],
			postgres: [],
			...emptyServiceArrays,
		},
	],
});

const fakeDb = (overrides: Record<string, unknown> = {}): TransferDb =>
	({
		query: {
			vaultProvider: { findMany: async () => [] },
			destinations: { findMany: async () => [] },
			registry: { findMany: async () => [] },
			network: { findMany: async () => [] },
			certificates: { findMany: async () => [] },
			...overrides,
		},
	}) as any as TransferDb;

describe("detectRequirements", () => {
	it("detects a vault requirement grouping every secretKey referenced", async () => {
		const application = {
			...baseApplication,
			env: "DB_PASS=${{vault.prod.DB_PASS}}\nAPI=${{vault.prod.API}}",
		};
		const db = fakeDb({
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
		});

		const requirements = await detectRequirements(
			db,
			buildTree(application) as any,
			baseScope,
		);

		const vaultReqs = requirements.filter((r) => r.kind === "vault");
		expect(vaultReqs).toHaveLength(1);
		expect(vaultReqs[0]).toMatchObject({
			kind: "vault",
			originalId: "vault-1",
			providerName: "prod",
			providerType: "hashicorp",
		});
		expect((vaultReqs[0] as any).secretKeys.sort()).toEqual(["API", "DB_PASS"]);
	});

	it("merges registry + buildRegistry into one requirement with both roles", async () => {
		const application = {
			...baseApplication,
			registryId: "registry-1",
			buildRegistryId: "registry-1",
		};
		const db = fakeDb({
			registry: {
				findMany: async () => [
					{
						registryId: "registry-1",
						registryUrl: "https://registry.example.com",
						imagePrefix: "acme",
					},
				],
			},
		});

		const requirements = await detectRequirements(
			db,
			buildTree(application) as any,
			baseScope,
		);

		const registryReqs = requirements.filter((r) => r.kind === "registry");
		expect(registryReqs).toHaveLength(1);
		expect((registryReqs[0] as any).role.sort()).toEqual([
			"buildRegistry",
			"registry",
		]);
	});

	it("emits a single server requirement with originalId null for services with no serverId", async () => {
		const application = { ...baseApplication, serverId: null };
		const requirements = await detectRequirements(
			fakeDb(),
			buildTree(application) as any,
			baseScope,
		);

		const serverReqs = requirements.filter((r) => r.kind === "server");
		expect(serverReqs).toHaveLength(1);
		expect(serverReqs[0]?.originalId).toBeNull();
		expect(serverReqs[0]?.usedBy).toHaveLength(1);
	});

	it("detects a gitProvider requirement with owner/repo", async () => {
		const application = {
			...baseApplication,
			githubId: "gh-1",
			owner: "acme",
			repository: "app",
		};
		const requirements = await detectRequirements(
			fakeDb(),
			buildTree(application) as any,
			baseScope,
		);

		const gitReqs = requirements.filter((r) => r.kind === "gitProvider");
		expect(gitReqs).toHaveLength(1);
		expect(gitReqs[0]).toMatchObject({
			providerType: "github",
			originalId: "gh-1",
		});
		expect((gitReqs[0] as any).repositories).toEqual([
			{ owner: "acme", repo: "app" },
		]);
	});

	it("detects a destination requirement from a backup FK", async () => {
		const application = {
			...baseApplication,
			volumeBackups: [{ destinationId: "dest-1" }],
		};
		const db = fakeDb({
			destinations: {
				findMany: async () => [
					{
						destinationId: "dest-1",
						bucket: "my-bucket",
						endpoint: "s3.example.com",
						region: "us-east-1",
					},
				],
			},
		});

		const requirements = await detectRequirements(
			db,
			buildTree(application) as any,
			baseScope,
		);

		const destReqs = requirements.filter((r) => r.kind === "destination");
		expect(destReqs).toHaveLength(1);
		expect(destReqs[0]).toMatchObject({
			originalId: "dest-1",
			bucket: "my-bucket",
			endpoint: "s3.example.com",
			region: "us-east-1",
		});
	});

	it("resolves network names for referenced networkIds", async () => {
		const application = { ...baseApplication, networkIds: ["net-1"] };
		const db = fakeDb({
			network: {
				findMany: async () => [{ networkId: "net-1", name: "shared-net" }],
			},
		});

		const requirements = await detectRequirements(
			db,
			buildTree(application) as any,
			baseScope,
		);

		const networkReqs = requirements.filter((r) => r.kind === "network");
		expect(networkReqs).toHaveLength(1);
		expect(networkReqs[0]).toMatchObject({
			originalId: "net-1",
			name: "shared-net",
		});
	});

	it("detects a certificate requirement via customCertResolver, not a direct FK", async () => {
		const application = {
			...baseApplication,
			domains: [
				{
					domainId: "dom-1",
					certificateType: "custom",
					customCertResolver: "cert-path-abc",
				},
			],
		};
		const db = fakeDb({
			certificates: {
				findMany: async () => [
					{
						certificateId: "cert-1",
						certificatePath: "cert-path-abc",
						certificateData:
							"-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----",
						serverId: "server-1",
					},
				],
			},
		});

		const requirements = await detectRequirements(
			db,
			buildTree(application) as any,
			baseScope,
		);

		const certReqs = requirements.filter((r) => r.kind === "certificate");
		expect(certReqs).toHaveLength(1);
		expect(certReqs[0]?.originalId).toBe("cert-1");
		expect((certReqs[0] as any).fingerprint).toMatch(/^[a-f0-9]{64}$/);
		expect((certReqs[0] as any).serverId).toBe("server-1");
	});

	it("dedupes requirements used by multiple services into one entry with combined usedBy", async () => {
		const application1 = {
			...baseApplication,
			applicationId: "app-1",
			serverId: "server-1",
		};
		const application2 = {
			...baseApplication,
			applicationId: "app-2",
			serverId: "server-1",
		};
		const tree = buildTree(application1) as any;
		tree.environments[0].applications.push(application2);

		const requirements = await detectRequirements(fakeDb(), tree, baseScope);
		const serverReqs = requirements.filter((r) => r.kind === "server");
		expect(serverReqs).toHaveLength(1);
		expect(serverReqs[0]?.usedBy).toHaveLength(2);
	});

	it("only scans services actually within scope.serviceIds", async () => {
		const included = {
			...baseApplication,
			applicationId: "app-included",
			githubId: "gh-1",
			owner: "acme",
			repository: "included-repo",
		};
		const excluded = {
			...baseApplication,
			applicationId: "app-excluded",
			githubId: "gh-1",
			owner: "acme",
			repository: "excluded-repo",
		};
		const tree = buildTree(included) as any;
		tree.environments[0].applications.push(excluded);

		const requirements = await detectRequirements(fakeDb(), tree, {
			...baseScope,
			serviceIds: ["app-included"],
		});

		const gitReqs = requirements.filter((r) => r.kind === "gitProvider");
		expect(gitReqs).toHaveLength(1);
		expect((gitReqs[0] as any).repositories).toEqual([
			{ owner: "acme", repo: "included-repo" },
		]);
	});
});
