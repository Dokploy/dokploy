import { describe, expect, it } from "vitest";
import { normalizeChangedFilesFromCommits } from "../../../../packages/server/src/utils/watch-paths/normalize-changed-files";

describe("normalizeChangedFilesFromCommits", () => {
	it("merges added, modified, and removed files from commit payloads", () => {
		expect(
			normalizeChangedFilesFromCommits([
				{
					added: ["docker-compose.dokploy.yml"],
					modified: ["steam/src/app.ts"],
					removed: ["old/file.ts"],
				},
			]),
		).toEqual([
			"docker-compose.dokploy.yml",
			"steam/src/app.ts",
			"old/file.ts",
		]);
	});

	it("ignores missing and non-string file entries instead of returning nullish values", () => {
		expect(
			normalizeChangedFilesFromCommits([
				{
					added: undefined,
					modified: [undefined, "steam/src/app.ts", ""],
					removed: [
						null,
						"shared/migrations/0007_csfloat_buy_attempt_flows.ts",
					],
				},
				undefined,
				{
					added: ["steamCSFloat/src/csfloatScanning.ts"],
				},
			] as any),
		).toEqual([
			"steam/src/app.ts",
			"shared/migrations/0007_csfloat_buy_attempt_flows.ts",
			"steamCSFloat/src/csfloatScanning.ts",
		]);
	});

	it("returns an empty list when commits are missing", () => {
		expect(normalizeChangedFilesFromCommits(undefined as any)).toEqual([]);
		expect(normalizeChangedFilesFromCommits([])).toEqual([]);
	});
});
