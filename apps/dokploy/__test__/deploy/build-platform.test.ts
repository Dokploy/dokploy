import {
	BuildArchitectureError,
	DEFAULT_MULTIARCH_BUILDER,
	dockerfileBuilderName,
	ensureMultiarchBuilderCommand,
	planArchitecture,
	planPlatformArgs,
	usesBuildx,
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

describe("dockerfile builder selection", () => {
	it("creates dokploy-multiarch only when pushing without a named builder", () => {
		const plan = {
			platforms: ["linux/amd64", "linux/arm64"] as const,
			builder: null,
			createDefaultBuilder: true,
			output: {
				mode: "push" as const,
				tags: ["ghcr.io/acme/app:latest"],
				logins: "",
			},
		};
		expect(dockerfileBuilderName(plan)).toBe(DEFAULT_MULTIARCH_BUILDER);
		expect(ensureMultiarchBuilderCommand(plan)).toContain(
			DEFAULT_MULTIARCH_BUILDER,
		);
		expect(usesBuildx(plan)).toBe(true);
	});

	it("does not create the default builder when the user named one", () => {
		const plan = {
			platforms: ["linux/amd64", "linux/arm64"] as const,
			builder: "farm",
			createDefaultBuilder: false,
			output: {
				mode: "push" as const,
				tags: ["ghcr.io/acme/app:latest"],
				logins: "",
			},
		};
		expect(dockerfileBuilderName(plan)).toBe("farm");
		expect(ensureMultiarchBuilderCommand(plan)).toBe("");
	});
});
