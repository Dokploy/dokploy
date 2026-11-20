import { apiSaveBuildType } from "@dokploy/server/db/schema/application";
import { describe, expect, it } from "vitest";

const buildTypeInput = {
	applicationId: "test-app",
	buildType: "railpack",
	dockerfile: null,
	dockerContextPath: null,
	dockerBuildStage: null,
	herokuVersion: null,
};

describe("Railpack build type validation", () => {
	it.each(["0.15.4", "latest"])(
		"accepts %s without unrelated optional fields",
		(railpackVersion) => {
			expect(
				apiSaveBuildType.safeParse({ ...buildTypeInput, railpackVersion })
					.success,
			).toBe(true);
		},
	);

	it.each(["", "   ", null])(
		"rejects an empty Railpack version: %s",
		(railpackVersion) => {
			const result = apiSaveBuildType.safeParse({
				...buildTypeInput,
				railpackVersion,
			});

			expect(result.success).toBe(false);
			if (!result.success) {
				expect(result.error.issues).toEqual(
					expect.arrayContaining([
						expect.objectContaining({ path: ["railpackVersion"] }),
					]),
				);
			}
		},
	);

	it("allows other builders without a Railpack version", () => {
		expect(
			apiSaveBuildType.safeParse({
				...buildTypeInput,
				buildType: "nixpacks",
				railpackVersion: null,
			}).success,
		).toBe(true);
	});
});
