import {
	BuildArchitectureError,
	DEFAULT_MULTIARCH_BUILDER,
	dockerfileBuildxBuilder,
	ensureMultiarchBuilderCommand,
	planBuildArchitecture,
	planPlatformArgs,
	usesBuildx,
} from "@dokploy/server/utils/builders/build-platform";
import { describe, expect, it } from "vitest";

const base = {
	buildType: "dockerfile",
	sourceType: "git",
	registry: null,
	buildRegistry: null,
	rollbackRegistry: null,
};

describe("planBuildArchitecture", () => {
	it("defaults to host with no platform", () => {
		const plan = planBuildArchitecture(base);
		expect(plan).toEqual({ kind: "host", builder: null });
		expect(planPlatformArgs(plan)).toEqual([]);
		expect(usesBuildx(plan)).toBe(false);
	});

	it("trims a named builder on host", () => {
		const plan = planBuildArchitecture({
			...base,
			buildArchitecture: "host",
			buildxBuilder: "  native-arm  ",
		});
		expect(plan).toEqual({ kind: "host", builder: "native-arm" });
		expect(usesBuildx(plan)).toBe(true);
		expect(dockerfileBuildxBuilder(plan)).toBe("native-arm");
	});

	it("maps amd64 and arm64 to a single platform", () => {
		expect(
			planBuildArchitecture({
				...base,
				buildArchitecture: "amd64",
			}),
		).toEqual({
			kind: "single",
			platform: "linux/amd64",
			builder: null,
		});
		expect(
			planBuildArchitecture({
				...base,
				buildArchitecture: "arm64",
				buildxBuilder: "box",
			}),
		).toEqual({
			kind: "single",
			platform: "linux/arm64",
			builder: "box",
		});
	});

	it("plans multi-arch when a registry is present", () => {
		const plan = planBuildArchitecture({
			...base,
			buildArchitecture: "multi",
			registry: { registryId: "r1" },
		});
		expect(plan).toEqual({
			kind: "multi",
			platforms: ["linux/amd64", "linux/arm64"],
			builder: null,
		});
		expect(planPlatformArgs(plan)).toEqual([
			"--platform",
			"linux/amd64,linux/arm64",
		]);
		expect(dockerfileBuildxBuilder(plan)).toBe(DEFAULT_MULTIARCH_BUILDER);
		expect(ensureMultiarchBuilderCommand(plan)).toContain(
			DEFAULT_MULTIARCH_BUILDER,
		);
	});

	it("does not create the default builder when the user named one", () => {
		const plan = planBuildArchitecture({
			...base,
			buildArchitecture: "multi",
			buildxBuilder: "farm",
			buildRegistry: { registryId: "r1" },
		});
		expect(dockerfileBuildxBuilder(plan)).toBe("farm");
		expect(ensureMultiarchBuilderCommand(plan)).toBe("");
	});

	it("rejects multi-arch without a registry", () => {
		expect(() =>
			planBuildArchitecture({
				...base,
				buildArchitecture: "multi",
			}),
		).toThrow(BuildArchitectureError);
	});

	it("rejects pack builders when architecture is not host", () => {
		expect(() =>
			planBuildArchitecture({
				...base,
				buildType: "nixpacks",
				buildArchitecture: "amd64",
			}),
		).toThrow(/Host native/);
		expect(() =>
			planBuildArchitecture({
				...base,
				buildType: "heroku_buildpacks",
				buildArchitecture: "multi",
				registry: { registryId: "r1" },
			}),
		).toThrow(/Host native/);
	});

	it("ignores architecture for docker source images", () => {
		const plan = planBuildArchitecture({
			...base,
			sourceType: "docker",
			buildArchitecture: "multi",
			buildxBuilder: "farm",
			registry: { registryId: "r1" },
		});
		expect(plan).toEqual({ kind: "host", builder: null });
	});
});
