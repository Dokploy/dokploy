import { createHash } from "node:crypto";
import type {
	Requirement,
	Snapshot,
	TransferDb,
} from "@dokploy/server/services/project-export-import";
import {
	LOCAL_SERVER_CANDIDATE_ID,
	proposeResolutions,
	requirementKey,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const CERT_FINGERPRINT = createHash("sha256")
	.update("cert-data-1")
	.digest("hex");

const vaultRequirement: Requirement = {
	kind: "vault",
	originalId: "vault-src",
	configIncluded: false,
	usedBy: [],
	providerName: "prod",
	providerType: "hashicorp",
	secretKeys: [],
};
const gitProviderRequirement: Requirement = {
	kind: "gitProvider",
	originalId: "gh-src",
	configIncluded: false,
	usedBy: [],
	providerType: "github",
	repositories: [],
};
const destinationRequirement: Requirement = {
	kind: "destination",
	originalId: "dest-src",
	configIncluded: true,
	usedBy: [],
	bucket: "my-bucket",
	endpoint: "https://s3.example.com",
	region: "us-east-1",
};
const registryRequirement: Requirement = {
	kind: "registry",
	originalId: "reg-src",
	configIncluded: true,
	usedBy: [],
	registryUrl: "https://registry.example.com",
	imagePrefix: "acme",
	role: ["registry"],
};
const sshKeyRequirement: Requirement = {
	kind: "sshKey",
	originalId: "key-src",
	configIncluded: true,
	usedBy: [],
	publicKey: "ssh-ed25519 AAAAtest",
};
const networkRequirement: Requirement = {
	kind: "network",
	originalId: "net-src",
	configIncluded: false,
	usedBy: [],
	name: "my-network",
};
const certificateRequirement: Requirement = {
	kind: "certificate",
	originalId: "cert-src",
	configIncluded: false,
	usedBy: [],
	fingerprint: CERT_FINGERPRINT,
	serverId: null,
};
const serverRequirement: Requirement = {
	kind: "server",
	originalId: "server-src",
	configIncluded: false,
	usedBy: [],
};

const requirements: Requirement[] = [
	vaultRequirement,
	gitProviderRequirement,
	destinationRequirement,
	registryRequirement,
	sshKeyRequirement,
	networkRequirement,
	certificateRequirement,
	serverRequirement,
];

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
		counts: {},
	},
	resources: { project: {}, environments: [], services: [], shared: {} },
	requirements,
	warnings: [],
	dumps: [],
};

const fakeDb = (): TransferDb =>
	({
		query: {
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
			gitProvider: {
				findMany: async () => [
					{
						gitProviderId: "gh-dest-1",
						name: "Acme GitHub",
						providerType: "github",
						organizationId: "org-dest",
					},
				],
			},
			destinations: { findMany: async () => [] },
			registry: {
				findMany: async () => [
					{
						registryId: "reg-dest-1",
						registryName: "Acme Registry",
						registryUrl: "https://other.example.com",
						imagePrefix: "other",
						organizationId: "org-dest",
					},
				],
			},
			sshKeys: {
				findMany: async () => [
					{
						sshKeyId: "key-dest-1",
						name: "deploy key",
						publicKey: "ssh-ed25519 AAAAtest",
						organizationId: "org-dest",
					},
				],
			},
			network: {
				findMany: async () => [
					{
						networkId: "net-dest-1",
						name: "other-network",
						organizationId: "org-dest",
					},
				],
			},
			certificates: { findMany: async () => [] },
			server: {
				findMany: async () => [
					{
						serverId: "server-dest-1",
						name: "prod-server",
						organizationId: "org-dest",
					},
				],
			},
		},
	}) as any as TransferDb;

describe("proposeResolutions", () => {
	it("resolves vault by name + providerType match", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(vaultRequirement)]).toEqual({
			status: "resolved",
			targetId: "vault-dest-1",
		});
	});

	it("never auto-resolves gitProvider, always mappable/missing by type", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(gitProviderRequirement)]).toEqual({
			status: "mappable",
			candidates: [{ id: "gh-dest-1", name: "Acme GitHub" }],
		});
	});

	it("proposes createable for destination when configIncluded and no match", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(destinationRequirement)]).toEqual({
			status: "createable",
			candidates: [],
		});
	});

	it("proposes createable for registry with existing-org candidates attached when no exact match", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(registryRequirement)]).toEqual({
			status: "createable",
			candidates: [{ id: "reg-dest-1", name: "Acme Registry" }],
		});
	});

	it("resolves sshKey by exact publicKey match", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(sshKeyRequirement)]).toEqual({
			status: "resolved",
			targetId: "key-dest-1",
		});
	});

	it("proposes mappable for network when configIncluded is false and no exact match but candidates exist", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(networkRequirement)]).toEqual({
			status: "mappable",
			candidates: [{ id: "net-dest-1", name: "other-network" }],
		});
	});

	it("resolves certificate by recomputed fingerprint match", async () => {
		const withMatchingCert: TransferDb = {
			query: {
				...(fakeDb() as any).query,
				certificates: {
					findMany: async () => [
						{
							certificateId: "cert-dest-1",
							name: "prod cert",
							certificateData: "cert-data-1",
							organizationId: "org-dest",
						},
					],
				},
			},
		} as any;
		const result = await proposeResolutions(
			withMatchingCert,
			snapshot,
			"org-dest",
		);
		expect(result[requirementKey(certificateRequirement)]).toEqual({
			status: "resolved",
			targetId: "cert-dest-1",
		});
	});

	it("proposes missing for certificate when no fingerprint match and configIncluded is false", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(certificateRequirement)]).toEqual({
			status: "missing",
		});
	});

	it("is always mappable for server, offering the local-server sentinel alongside org servers", async () => {
		const result = await proposeResolutions(fakeDb(), snapshot, "org-dest");
		expect(result[requirementKey(serverRequirement)]).toEqual({
			status: "mappable",
			candidates: [
				{ id: LOCAL_SERVER_CANDIDATE_ID, name: "Local server" },
				{ id: "server-dest-1", name: "prod-server" },
			],
		});
	});
});
