import {
	assertPersistedArchitecture,
	BuildArchitectureError,
	mergePersistedArchitecture,
	planArchitecture,
	planPlatformArgs,
} from "@dokploy/server/utils/builders/build-platform";
import { describe, expect, it } from "vitest";

const base = {
	appName: "test-app",
	buildType: "dockerfile",
	sourceType: "git",
	registry: null,
	buildRegistry: null,
};

describe("planArchitecture", () => {
	it("defaults to host with no platform", () => {
		const plan = planArchitecture(base);
		expect(plan.architecture).toBe("host");
		expect(plan.platforms).toEqual([]);
		expect(plan.builder).toBe(null);
		expect(planPlatformArgs(plan)).toEqual([]);
	});

	it("trims a named builder", () => {
		const plan = planArchitecture({
			...base,
			buildArchitecture: "host",
			buildxBuilder: "  native-arm  ",
		});
		expect(plan.builder).toBe("native-arm");
	});

	it("maps amd64 and arm64 to a single platform", () => {
		expect(
			planArchitecture({
				...base,
				buildArchitecture: "amd64",
			}).platforms,
		).toEqual(["linux/amd64"]);
		expect(
			planArchitecture({
				...base,
				buildArchitecture: "arm64",
				buildxBuilder: "box",
			}),
		).toMatchObject({
			platforms: ["linux/arm64"],
			builder: "box",
		});
	});

	it("maps multi-arch to both platforms", () => {
		const plan = planArchitecture({
			...base,
			buildArchitecture: "multi",
			registry: { registryId: "r1" },
		});
		expect(plan.platforms).toEqual(["linux/amd64", "linux/arm64"]);
		expect(planPlatformArgs(plan)).toEqual([
			"--platform",
			"linux/amd64,linux/arm64",
		]);
	});

	it("rejects pack builders when architecture is not host", () => {
		expect(() =>
			planArchitecture({
				...base,
				buildType: "nixpacks",
				buildArchitecture: "amd64",
			}),
		).toThrow(BuildArchitectureError);
		expect(() =>
			planArchitecture({
				...base,
				buildType: "heroku_buildpacks",
				buildArchitecture: "multi",
				registry: { registryId: "r1" },
			}),
		).toThrow(/Host native/);
	});

	it("ignores architecture for docker source images", () => {
		const plan = planArchitecture({
			...base,
			sourceType: "docker",
			buildArchitecture: "multi",
			buildxBuilder: "farm",
			registry: { registryId: "r1" },
		});
		expect(plan.architecture).toBe("host");
		expect(plan.platforms).toEqual([]);
	});
});

describe("assertPersistedArchitecture", () => {
	it("allows host with any builder and no registry", () => {
		expect(() =>
			assertPersistedArchitecture({
				buildType: "nixpacks",
				buildArchitecture: "host",
				registryId: null,
				buildRegistryId: null,
			}),
		).not.toThrow();
	});

	it("rejects pack builders with a pinned architecture", () => {
		expect(() =>
			assertPersistedArchitecture({
				buildType: "nixpacks",
				buildArchitecture: "amd64",
				registryId: "r1",
				buildRegistryId: null,
			}),
		).toThrow(BuildArchitectureError);
	});

	it("rejects multi-arch after both run registries are cleared", () => {
		expect(() =>
			assertPersistedArchitecture({
				buildType: "dockerfile",
				buildArchitecture: "multi",
				registryId: null,
				buildRegistryId: null,
			}),
		).toThrow(/cluster registry or a build registry/);
	});

	it("rejects a Cluster Settings save that drops the last registry while multi stays set", () => {
		expect(() =>
			assertPersistedArchitecture(
				mergePersistedArchitecture(
					{
						buildType: "dockerfile",
						buildArchitecture: "multi",
						registryId: "cluster-registry",
						buildRegistryId: null,
					},
					{ registryId: null },
				),
			),
		).toThrow(/cluster registry or a build registry/);
	});

	it("rejects a pack-builder switch that leaves a pinned architecture in place", () => {
		expect(() =>
			assertPersistedArchitecture(
				mergePersistedArchitecture(
					{
						buildType: "dockerfile",
						buildArchitecture: "amd64",
						registryId: null,
						buildRegistryId: null,
					},
					{ buildType: "nixpacks" },
				),
			),
		).toThrow(BuildArchitectureError);
	});

	it("allows a partial update that does not change architecture, build type, or registries", () => {
		expect(() =>
			assertPersistedArchitecture(
				mergePersistedArchitecture(
					{
						buildType: "dockerfile",
						buildArchitecture: "multi",
						registryId: "cluster-registry",
						buildRegistryId: null,
					},
					{},
				),
			),
		).not.toThrow();
	});
});
