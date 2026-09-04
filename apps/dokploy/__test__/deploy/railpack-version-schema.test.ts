import {
	apiSaveBuildType,
	apiUpdateApplication,
} from "@dokploy/server/db/schema/application";
import { describe, expect, it } from "vitest";

// Regression tests for the server-side validation of the user-controlled
// `railpackVersion` and `herokuVersion` fields. Both are spliced into a bash
// build script and must be constrained to version-shaped strings (and keep
// accepting null/empty so the UI save flow for non-railpack/heroku build types
// is not broken). See railpack.injection.test.ts for the sink-level coverage.

const validRailpack = {
	applicationId: "app-1",
	buildType: "railpack" as const,
	dockerfile: "",
	dockerContextPath: "",
	dockerBuildStage: "",
	herokuVersion: null,
	railpackVersion: "0.15.4",
};

const validHeroku = {
	applicationId: "app-1",
	buildType: "heroku_buildpacks" as const,
	dockerfile: "",
	dockerContextPath: "",
	dockerBuildStage: "",
	herokuVersion: "24",
	railpackVersion: null,
};

describe("apiSaveBuildType railpackVersion validation", () => {
	it.each([
		["0.15.4"],
		["1.2.3"],
		["0.15.4-rc.1"],
		["0.15.4-alpha-beta.gamma"],
	])("accepts valid railpack version %j", (railpackVersion) => {
		const result = apiSaveBuildType.safeParse({
			...validRailpack,
			railpackVersion,
		});
		expect(result.success).toBe(true);
	});

	it.each([
		["0.15.4; touch /tmp/pwned"],
		["0.15.4$(touch /tmp/x)"],
		["0.15.4`touch /tmp/x`"],
		["0.15.4 && touch /tmp/x"],
		["0.15.4 | touch /tmp/x"],
		["0.15.4\ntouch /tmp/x"],
		["3"],
		["0.15"],
		["v0.15.4"],
		["0.15.4;"],
		[" 0.15.4"],
	])("rejects invalid railpack version %j", (railpackVersion) => {
		const result = apiSaveBuildType.safeParse({
			...validRailpack,
			railpackVersion,
		});
		expect(result.success).toBe(false);
	});

	it("accepts null railpackVersion (non-railpack save flow)", () => {
		const result = apiSaveBuildType.safeParse({
			...validHeroku,
			railpackVersion: null,
		});
		expect(result.success).toBe(true);
	});
});

describe("apiSaveBuildType herokuVersion validation", () => {
	it.each(["24", "22", "20", ""])(
		"accepts valid heroku stack %j (empty = use default)",
		(herokuVersion) => {
			const result = apiSaveBuildType.safeParse({
				...validHeroku,
				herokuVersion,
			});
			expect(result.success).toBe(true);
		},
	);

	it.each([
		"24; touch /tmp/x",
		"$(touch /tmp/x)",
		"`touch /tmp/x`",
		"24 && touch /tmp/x",
		"24.0",
		"v24",
	])("rejects invalid heroku version %j", (herokuVersion) => {
		const result = apiSaveBuildType.safeParse({
			...validHeroku,
			herokuVersion,
		});
		expect(result.success).toBe(false);
	});

	it("accepts null herokuVersion (non-heroku save flow)", () => {
		const result = apiSaveBuildType.safeParse({
			...validRailpack,
			herokuVersion: null,
		});
		expect(result.success).toBe(true);
	});
});

describe("apiUpdateApplication version field validation (partial)", () => {
	it("accepts an omitted (undefined) railpackVersion", () => {
		const result = apiUpdateApplication.safeParse({ applicationId: "app-1" });
		expect(result.success).toBe(true);
	});

	it("accepts null railpack/heroku version", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId: "app-1",
			railpackVersion: null,
			herokuVersion: null,
		});
		expect(result.success).toBe(true);
	});

	it("rejects an injected railpackVersion", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId: "app-1",
			railpackVersion: "0.15.4; touch /tmp/x",
		});
		expect(result.success).toBe(false);
	});

	it("rejects an injected herokuVersion", () => {
		const result = apiUpdateApplication.safeParse({
			applicationId: "app-1",
			herokuVersion: "24; touch /tmp/x",
		});
		expect(result.success).toBe(false);
	});
});
