import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { describe, expect, it } from "vitest";

// Regression test for https://github.com/Dokploy/dokploy/issues/5417
// With "Docker Context Path" left empty, the docker build context must default
// to the application's code root, not to the Dockerfile's own directory.
const { APPLICATIONS_PATH } = paths(false);

const createMockApplication = (overrides: Record<string, unknown> = {}) => ({
	applicationId: "test-app-id",
	name: "Test App",
	appName: "test-app",
	sourceType: "github",
	buildType: "dockerfile",
	dockerfile: "docker/api/Dockerfile",
	dockerContextPath: null,
	buildPath: "",
	env: "",
	serverId: null,
	buildServerId: null,
	publishDirectory: null,
	createEnvFile: false,
	dockerBuildStage: null,
	cleanCache: false,
	buildArgs: null,
	buildSecrets: null,
	environment: {
		projectId: "project-id",
		env: "",
		name: "production",
		project: {
			name: "Test Project",
			organizationId: "org-id",
			env: "",
		},
	},
	...overrides,
});

// The generated script cds into the context dir first: `cd <context> || { ... }`.
// Extract that exact path so assertions can't false-positive on prefixes.
const extractCdTarget = (command: string): string => {
	const match = command.match(/^cd (\S+) \|\|/m);
	if (!match) throw new Error("could not find `cd <context> ||` in command");
	return match[1];
};

const codeRoot = path.join(APPLICATIONS_PATH, "test-app", "code");

describe("getDockerCommand - docker context path (issue #5417)", () => {
	it("defaults to the code root when Docker Context Path is empty", () => {
		const command = getDockerCommand(createMockApplication() as any);
		expect(extractCdTarget(command)).toBe(codeRoot);
	});

	it("does not fall back to the Dockerfile directory", () => {
		const command = getDockerCommand(createMockApplication() as any);
		const dockerfileDir = path.join(codeRoot, "docker", "api");
		expect(extractCdTarget(command)).not.toBe(dockerfileDir);
	});

	it("respects an explicitly configured Docker Context Path", () => {
		const command = getDockerCommand(
			createMockApplication({ dockerContextPath: "docker/api" }) as any,
		);
		expect(extractCdTarget(command)).toBe(path.join(codeRoot, "docker", "api"));
	});

	it("still uses the code root when the Dockerfile is at the repo root", () => {
		const command = getDockerCommand(
			createMockApplication({ dockerfile: "Dockerfile" }) as any,
		);
		expect(extractCdTarget(command)).toBe(codeRoot);
	});
});
