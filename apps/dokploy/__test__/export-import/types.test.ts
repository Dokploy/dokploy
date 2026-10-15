import { serviceType } from "@dokploy/server/db/schema";
import {
	manifestSchema,
	requirementSchema,
	serviceTypeSchema,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const validManifest = {
	format: "dokploy-project-export",
	formatVersion: 1,
	exportedAt: new Date().toISOString(),
	exportedBy: { userId: "user-1", email: "a@b.com" },
	sourceInstance: { dokployVersion: "1.0.0", organizationId: "org-1" },
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
		keyCheck: "a2V5Y2hlY2s=",
	},
	counts: { application: 1 },
};

describe("transfer types", () => {
	it("accepts a valid manifest", () => {
		expect(manifestSchema.safeParse(validManifest).success).toBe(true);
	});

	it("accepts a structurally-valid manifest with a future formatVersion (rejecting it is migrateManifest's job, not the schema's)", () => {
		const result = manifestSchema.safeParse({
			...validManifest,
			formatVersion: 2,
		});
		expect(result.success).toBe(true);
	});

	it("rejects a formatVersion that isn't a positive integer", () => {
		expect(
			manifestSchema.safeParse({ ...validManifest, formatVersion: 0 }).success,
		).toBe(false);
		expect(
			manifestSchema.safeParse({ ...validManifest, formatVersion: 1.5 })
				.success,
		).toBe(false);
	});

	it("rejects a Requirement with an unknown kind", () => {
		const result = requirementSchema.safeParse({
			kind: "unknownKind",
			originalId: null,
			configIncluded: false,
			usedBy: [],
		});
		expect(result.success).toBe(false);
	});

	it("accepts every real Requirement kind with its shape", () => {
		const base = { originalId: "id-1", configIncluded: true, usedBy: [] };
		const cases = [
			{
				...base,
				kind: "vault",
				providerName: "prod",
				providerType: "hashicorp",
				secretKeys: ["DB_PASS"],
			},
			{
				...base,
				kind: "gitProvider",
				providerType: "github",
				repositories: [{ owner: "acme", repo: "app" }],
			},
			{
				...base,
				kind: "destination",
				bucket: "b",
				endpoint: "e",
				region: "r",
			},
			{
				...base,
				kind: "registry",
				registryUrl: "r",
				imagePrefix: "p",
				role: ["registry"],
			},
			{ ...base, kind: "sshKey", publicKey: "ssh-ed25519 AAAA" },
			{ ...base, kind: "network", name: "net" },
			{ ...base, kind: "certificate", fingerprint: "abc123", serverId: null },
			{ ...base, kind: "server", originalId: null, serverId: null },
		];
		for (const testCase of cases) {
			expect(
				requirementSchema.safeParse(testCase).success,
				`kind ${testCase.kind} should be valid`,
			).toBe(true);
		}
	});

	it("keeps serviceTypeSchema in sync with the serviceType DB enum", () => {
		expect([...serviceTypeSchema.options].sort()).toEqual(
			[...serviceType.enumValues].sort(),
		);
	});
});
