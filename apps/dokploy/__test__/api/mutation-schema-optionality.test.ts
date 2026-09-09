import { describe, expect, it } from "vitest";
import {
	apiSaveBuildType,
	apiSaveEnvironmentVariables,
} from "@dokploy/server/db/schema/application";
import { apiCreateRegistry } from "@dokploy/server/db/schema/registry";

// Regression for https://github.com/Dokploy/dokploy/issues/4724:
// API mutations forced callers to pass fields unrelated to their use case
// (nullable in the DB) because the input schemas were built with bare
// `.required()`. The web UI never notices - it submits every form field - but
// API consumers hit BAD_REQUEST until they discover each field by trial.

describe("mutation schema optionality (#4724)", () => {
	it("saveBuildType accepts a dockerfile build without heroku/railpack fields", () => {
		const parsed = apiSaveBuildType.parse({
			applicationId: "app-1",
			buildType: "dockerfile",
		});
		expect(parsed.buildType).toBe("dockerfile");
		expect(parsed.herokuVersion).toBeUndefined();
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

	it("saveEnvironment still requires applicationId", () => {
		expect(() => apiSaveEnvironmentVariables.parse({ env: "FOO=bar" })).toThrow();
	});

	it("registry.create defaults registryType to cloud", () => {
		const parsed = apiCreateRegistry.parse({
			registryName: "dockerhub",
			username: "u",
			password: "p",
			registryUrl: "",
			organizationId: "org-1",
			registryId: "reg-1",
		});
		expect(parsed.registryType).toBe("cloud");
	});

	it("registry.create still requires the credential fields", () => {
		expect(() =>
			apiCreateRegistry.parse({
				registryName: "dockerhub",
				organizationId: "org-1",
				registryId: "reg-1",
			}),
		).toThrow();
	});
});
