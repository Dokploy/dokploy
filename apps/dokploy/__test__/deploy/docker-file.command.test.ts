import type { ApplicationNested } from "@dokploy/server/utils/builders";
import type { BuildPlan } from "@dokploy/server/utils/builders/build-platform";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { describe, expect, it } from "vitest";

const createApplication = (
	overrides: Partial<ApplicationNested> = {},
): ApplicationNested =>
	({
		appName: "test-app",
		buildType: "dockerfile",
		sourceType: "git",
		customGitBuildPath: "/",
		dockerfile: "Dockerfile",
		env: null,
		buildArgs: null,
		buildSecrets: null,
		publishDirectory: null,
		dockerBuildStage: null,
		dockerContextPath: null,
		cleanCache: false,
		createEnvFile: false,
		environment: {
			project: {
				env: "",
			},
			env: "",
		},
		...overrides,
	}) as unknown as ApplicationNested;

const localPlan = (overrides: Partial<BuildPlan> = {}): BuildPlan => ({
	platforms: [],
	builder: null,
	output: { mode: "local", image: "test-app" },
	...overrides,
});

describe("getDockerCommand", () => {
	it("builds with classic docker build and no platform flag by default", () => {
		const command = getDockerCommand(createApplication(), localPlan());

		expect(command).toContain("docker build -t test-app -f");
		expect(command).not.toContain("buildx");
		expect(command).not.toContain("--platform");
		expect(command).not.toContain("--push");
		expect(command).not.toContain("--load");
	});

	it("adds --target when dockerBuildStage is set", () => {
		const command = getDockerCommand(
			createApplication({
				dockerBuildStage: "builder",
			}),
			localPlan(),
		);

		expect(command).toContain("--target builder");
	});

	it("adds --no-cache when cleanCache is enabled", () => {
		const command = getDockerCommand(
			createApplication({
				cleanCache: true,
			}),
			localPlan(),
		);

		expect(command).toContain("--no-cache");
	});

	it("does not write an env file when createEnvFile is false", () => {
		const command = getDockerCommand(
			createApplication({
				createEnvFile: false,
			}),
			localPlan(),
		);

		expect(command).not.toContain("base64 -d");
	});

	it("writes an env file when createEnvFile is true", () => {
		const command = getDockerCommand(
			createApplication({
				createEnvFile: true,
			}),
			localPlan(),
		);

		expect(command).toContain("base64 -d");
	});

	it("adds --platform on classic docker build for a single architecture", () => {
		const command = getDockerCommand(
			createApplication(),
			localPlan({ platforms: ["linux/amd64"] }),
		);

		expect(command).toContain("docker build ");
		expect(command).toContain("--platform linux/amd64");
		expect(command).not.toContain("buildx");
		expect(command).not.toContain("--push");
	});

	it("uses buildx --load when a named builder is set for a local image", () => {
		const command = getDockerCommand(
			createApplication(),
			localPlan({
				platforms: ["linux/arm64"],
				builder: "native-arm",
			}),
		);

		expect(command).toContain("docker buildx build");
		expect(command).toContain("--builder");
		expect(command).toContain("native-arm");
		expect(command).toContain("--platform linux/arm64");
		expect(command).toContain("--load");
		expect(command).not.toContain("--push");
	});

	it("pushes a multi-arch manifest and does not tag a local image", () => {
		const command = getDockerCommand(createApplication(), {
			platforms: ["linux/amd64", "linux/arm64"],
			builder: null,
			output: {
				mode: "push",
				tags: ["ghcr.io/acme/test-app:latest"],
				logins: "",
			},
		});

		expect(command).toContain("docker buildx inspect");
		expect(command).toContain("dokploy-multiarch");
		expect(command).toContain("network=host");
		expect(command).toContain("docker buildx build");
		expect(command).toContain("--platform linux/amd64,linux/arm64");
		expect(command).toContain("--push");
		expect(command).toContain("-t");
		expect(command).toContain("ghcr.io/acme/test-app");
		expect(command).not.toContain("docker build -t test-app");
		expect(command).not.toContain("--load");
	});

	it("uses a named builder for multi-arch and does not create dokploy-multiarch", () => {
		const command = getDockerCommand(createApplication(), {
			platforms: ["linux/amd64", "linux/arm64"],
			builder: "farm",
			output: {
				mode: "push",
				tags: ["ghcr.io/acme/test-app:latest"],
				logins: "",
			},
		});

		expect(command).toContain("--builder farm");
		expect(command).not.toContain("dokploy-multiarch");
		expect(command).toContain("--push");
	});

	it("quotes a user-supplied builder name so it cannot break out of the command", () => {
		const command = getDockerCommand(
			createApplication(),
			localPlan({
				platforms: ["linux/amd64"],
				builder: "x; touch /tmp/pwned",
			}),
		);

		expect(command).toContain("buildx");
		expect(command).not.toMatch(/buildx build --builder x; touch/);
	});
});
