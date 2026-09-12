import type { ApplicationNested } from "@dokploy/server/utils/builders";
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

describe("getDockerCommand", () => {
	it("builds with classic docker build and no platform flag by default", () => {
		const command = getDockerCommand(createApplication());

		expect(command).toContain("docker build -t test-app -f");
		expect(command).not.toContain("buildx");
		expect(command).not.toContain("--platform");
		expect(command).not.toContain("--push");
	});

	it("adds --target when dockerBuildStage is set", () => {
		const command = getDockerCommand(
			createApplication({
				dockerBuildStage: "builder",
			}),
		);

		expect(command).toContain("--target builder");
	});

	it("adds --no-cache when cleanCache is enabled", () => {
		const command = getDockerCommand(
			createApplication({
				cleanCache: true,
			}),
		);

		expect(command).toContain("--no-cache");
	});

	it("does not write an env file when createEnvFile is false", () => {
		const command = getDockerCommand(
			createApplication({
				createEnvFile: false,
			}),
		);

		expect(command).not.toContain("base64 -d");
	});

	it("writes an env file when createEnvFile is true", () => {
		const command = getDockerCommand(
			createApplication({
				createEnvFile: true,
			}),
		);

		expect(command).toContain("base64 -d");
	});

	it("adds --platform on classic docker build for a single architecture", () => {
		const command = getDockerCommand(
			createApplication({
				buildArchitecture: "amd64",
			}),
		);

		expect(command).toContain("docker build ");
		expect(command).toContain("--platform linux/amd64");
		expect(command).not.toContain("buildx");
		expect(command).not.toContain("--push");
	});

	it("uses buildx --load when a named builder is set for a single architecture", () => {
		const command = getDockerCommand(
			createApplication({
				buildArchitecture: "arm64",
				buildxBuilder: "native-arm",
			}),
		);

		expect(command).toContain("docker buildx build");
		expect(command).toContain("--builder");
		expect(command).toContain("native-arm");
		expect(command).toContain("--platform linux/arm64");
		expect(command).not.toContain("--push");
	});

	it("pushes a multi-arch manifest and does not tag a local image", () => {
		const command = getDockerCommand(
			createApplication({
				buildArchitecture: "multi",
				registry: { registryId: "r1" } as ApplicationNested["registry"],
			}),
			{ pushTags: ["ghcr.io/acme/test-app:latest"] },
		);

		expect(command).toContain("docker buildx create");
		expect(command).toContain("dokploy-multiarch");
		expect(command).toContain("docker buildx build");
		expect(command).toContain("--platform linux/amd64,linux/arm64");
		expect(command).toContain("--push");
		expect(command).toContain("-t");
		expect(command).toContain("ghcr.io/acme/test-app");
		expect(command).not.toContain("docker build -t test-app");
	});

	it("quotes a user-supplied builder name so it cannot break out of the command", () => {
		const command = getDockerCommand(
			createApplication({
				buildArchitecture: "amd64",
				buildxBuilder: "x; touch /tmp/pwned",
			}),
		);

		expect(command).toContain("buildx");
		expect(command).not.toMatch(/buildx build --builder x; touch/);
	});
});
