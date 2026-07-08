import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { describe, expect, it } from "vitest";

const baseApplication = {
	appName: "my-app",
	buildType: "dockerfile",
	sourceType: "github",
	buildPath: "",
	customGitBuildPath: "",
	dockerfile: "Dockerfile",
	dockerContextPath: "",
	serverId: null,
	buildServerId: null,
	env: "",
	publishDirectory: "",
	buildArgs: "",
	buildSecrets: null,
	dockerBuildStage: "",
	cleanCache: false,
	createEnvFile: false,
	environment: { project: { env: "" }, env: "" },
} as unknown as Parameters<typeof getDockerCommand>[0];

describe("getDockerCommand command boundary", () => {
	it("quotes dockerfile paths, context paths, and build stages", () => {
		const command = getDockerCommand({
			...baseApplication,
			appName: "my app; touch /tmp/pwn",
			buildPath: "apps/api dir",
			buildArgs: "SAFE=va lue; touch /tmp/pwn",
			dockerfile: "Docker file",
			dockerContextPath: "apps/api dir",
			dockerBuildStage: "prod stage; touch /tmp/pwn",
		});

		expect(command).toMatch(/cd '[^']*apps\/api dir'/);
		expect(command).toMatch(
			/docker build -t 'my app; touch \/tmp\/pwn' -f '[^']*Docker file' \. --target 'prod stage; touch \/tmp\/pwn'/,
		);
		expect(command).toContain("--build-arg 'SAFE=va lue; touch /tmp/pwn'");
		expect(command).not.toMatch(/\ncd [^']/);
		expect(command).not.toContain("-t my app; touch /tmp/pwn");
		expect(command).not.toContain("--target prod stage; touch /tmp/pwn");
		expect(command).not.toContain("--build-arg SAFE=va lue; touch /tmp/pwn");
	});

	it("rejects unsafe dockerfile and context paths", () => {
		for (const pathField of [
			{ buildPath: "apps/api; touch /tmp/pwn" },
			{ dockerfile: "Dockerfile; touch /tmp/pwn" },
			{ dockerContextPath: "apps/api; touch /tmp/pwn" },
		]) {
			expect(() =>
				getDockerCommand({
					...baseApplication,
					...pathField,
				}),
			).toThrow("Invalid file path");
		}
	});

	it("quotes generated env file redirection paths", () => {
		const command = getDockerCommand({
			...baseApplication,
			buildPath: "apps/api dir",
			createEnvFile: true,
			env: "SAFE=value",
		});

		expect(command).toMatch(/base64 -d > '[^']*apps\/api dir\/\.env';/);
		expect(command).not.toContain("base64 -d > /Users");
	});

	it("rejects unsafe build secret environment variable names", () => {
		expect(() =>
			getDockerCommand({
				...baseApplication,
				buildSecrets: "SAFE=value\nBAD-DASH=value",
			}),
		).toThrow("Invalid environment variable name");
	});
});
