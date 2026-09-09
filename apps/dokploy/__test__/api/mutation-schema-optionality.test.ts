import { describe, expect, it } from "vitest";
import {
	apiSaveBuildType,
	apiSaveEnvironmentVariables,
} from "@dokploy/server/db/schema/application";
import { apiCreateRegistry, apiTestRegistry } from "@dokploy/server/db/schema/registry";

// Regression for https://github.com/Dokploy/dokploy/issues/4724:
// API mutations forced callers to pass fields unrelated to their use case
// (nullable in the DB) because the input schemas were built with bare
// `.required()`. The web UI never notices - it submits every form field - but
// API consumers hit BAD_REQUEST until they discover each field by trial.
//
// The masks are optional-with-default-null rather than merely optional:
// drizzle skips `undefined` on update, so an omitted field must still clear
// the stale column value, exactly like the UI's explicit null.

describe("mutation schema optionality (#4724)", () => {
	it("saveBuildType accepts a dockerfile build without heroku/railpack fields", () => {
		const parsed = apiSaveBuildType.parse({
			applicationId: "app-1",
			buildType: "dockerfile",
		});
		expect(parsed.buildType).toBe("dockerfile");
	});

	it("saveBuildType defaults omitted nullable fields to null so updates clear stale values", () => {
		const parsed = apiSaveBuildType.parse({
			applicationId: "app-1",
			buildType: "dockerfile",
		});
		// Switching build type to dockerfile must clear a stale herokuVersion
		// from a previous heroku_buildpacks configuration - drizzle writes the
		// nulls, while `undefined` would silently keep the old values.
		expect(parsed.herokuVersion).toBeNull();
		expect(parsed.railpackVersion).toBeNull();
		expect(parsed.dockerfile).toBeNull();
		expect(parsed.dockerContextPath).toBeNull();
		expect(parsed.dockerBuildStage).toBeNull();
	});

	it("saveBuildType still rejects a missing applicationId or buildType", () => {
		expect(() => apiSaveBuildType.parse({ buildType: "dockerfile" })).toThrow();
		expect(() => apiSaveBuildType.parse({ applicationId: "app-1" })).toThrow();
	});

	it("saveBuildType still accepts explicit nulls (web UI shape)", () => {
		const parsed = apiSaveBuildType.parse({
			applicationId: "app-1",
			buildType: "heroku_buildpacks",
			dockerfile: null,
			dockerContextPath: null,
			dockerBuildStage: null,
			herokuVersion: "3.0",
			railpackVersion: null,
			publishDirectory: null,
			isStaticSpa: null,
		});
		expect(parsed.herokuVersion).toBe("3.0");
	});

	it("saveEnvironment accepts env only, without buildArgs/buildSecrets/createEnvFile", () => {
		const parsed = apiSaveEnvironmentVariables.parse({
			applicationId: "app-1",
			env: "FOO=bar",
		});
		expect(parsed.env).toBe("FOO=bar");
		expect(parsed.buildArgs).toBeUndefined();
	});

	it("saveEnvironment rejects applicationId-only payloads (env is required)", () => {
		// Without env, the handler forwards only undefined values and drizzle's
		// mapUpdateSet throws "No values to set" - surfacing INTERNAL_SERVER_ERROR
		// where a clean BAD_REQUEST belongs.
		expect(() =>
			apiSaveEnvironmentVariables.parse({ applicationId: "app-1" }),
		).toThrow();
	});

	it("saveEnvironment still requires applicationId", () => {
		expect(() =>
			apiSaveEnvironmentVariables.parse({ env: "FOO=bar" }),
		).toThrow();
	});

	it("registry.create defaults registryType to cloud", () => {
		const parsed = apiCreateRegistry.parse({
			registryName: "dockerhub",
			username: "u",
			password: "p",
			registryUrl: "",
		});
		expect(parsed.registryType).toBe("cloud");
	});

	it("registry.create still requires the credential fields", () => {
		expect(() =>
			apiCreateRegistry.parse({
				registryName: "dockerhub",
			}),
		).toThrow();
	});

	it("apiTestRegistry defaults registryType to cloud", () => {
		const parsed = apiTestRegistry.parse({
			registryName: "dockerhub",
			username: "u",
			password: "p",
			registryUrl: "",
		});
		expect(parsed.registryType).toBe("cloud");
	});
});
