import { buildCgroupParentSchema } from "@dokploy/server/db/schema/shared";
import type { ApplicationNested } from "@dokploy/server/utils/builders";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { parse } from "shell-quote";
import { describe, expect, it } from "vitest";

const baseApplication = {
	appName: "test-app",
	env: "",
	buildArgs: "",
	buildSecrets: "",
	dockerfile: "Dockerfile",
	dockerContextPath: null,
	dockerBuildStage: null,
	publishDirectory: null,
	cleanCache: false,
	createEnvFile: false,
	environment: { env: "", project: { env: "" } },
} as unknown as ApplicationNested;

const dockerArgs = (command: string) => {
	const line = command
		.split("\n")
		.find((l) => l.trim().startsWith("docker build"));
	return line ? (parse(line.trim()) as string[]) : [];
};

describe("build cgroup parent", () => {
	it("passes --cgroup-parent to docker build when configured", () => {
		const args = dockerArgs(
			getDockerCommand(baseApplication, { cgroupParent: "/builds" }),
		);
		const idx = args.indexOf("--cgroup-parent");
		expect(idx).toBeGreaterThan(-1);
		expect(args[idx + 1]).toBe("/builds");
	});

	it("omits --cgroup-parent when not configured", () => {
		expect(dockerArgs(getDockerCommand(baseApplication))).not.toContain(
			"--cgroup-parent",
		);
		expect(
			dockerArgs(getDockerCommand(baseApplication, { cgroupParent: null })),
		).not.toContain("--cgroup-parent");
	});

	it("accepts cgroupfs paths and keeps slice notation as opaque text", () => {
		expect(buildCgroupParentSchema.parse("builds.slice:docker:")).toBe(
			"builds.slice:docker:",
		);
		expect(buildCgroupParentSchema.parse("/builds")).toBe("/builds");
		expect(buildCgroupParentSchema.parse("  builds  ")).toBe("builds");
	});

	it("stores an empty value as null", () => {
		expect(buildCgroupParentSchema.parse("")).toBeNull();
		expect(buildCgroupParentSchema.parse("   ")).toBeNull();
		expect(buildCgroupParentSchema.parse(null)).toBeNull();
	});

	it("rejects shell metacharacters", () => {
		for (const value of ["a;b", "$(x)", "a b", "`x`", "a|b", "a&&b"]) {
			expect(() => buildCgroupParentSchema.parse(value)).toThrow();
		}
	});
});
