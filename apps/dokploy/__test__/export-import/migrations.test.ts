import type { Manifest } from "@dokploy/server/services/project-export-import";
import {
	migrateManifest,
	TRANSFER_FORMAT,
	TRANSFER_FORMAT_VERSION,
	UnsupportedBundleVersionError,
} from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const baseManifest: Manifest = {
	format: TRANSFER_FORMAT,
	formatVersion: TRANSFER_FORMAT_VERSION,
	exportedAt: "2024-01-01T00:00:00.000Z",
	exportedBy: { userId: "user-1", email: "a@b.com" },
	sourceInstance: { dokployVersion: "1.0.0-test", organizationId: "org-1" },
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
};

describe("migrateManifest", () => {
	it("returns a v1 manifest unchanged (identity)", () => {
		const result = migrateManifest(baseManifest);
		expect(result).toEqual(baseManifest);
	});

	it("throws UnsupportedBundleVersionError for a bundle newer than this install supports", () => {
		const future: Manifest = {
			...baseManifest,
			formatVersion: TRANSFER_FORMAT_VERSION + 1,
		};
		expect(() => migrateManifest(future)).toThrow(
			UnsupportedBundleVersionError,
		);
		expect(() => migrateManifest(future)).toThrow(/newer version of Dokploy/i);
	});
});
