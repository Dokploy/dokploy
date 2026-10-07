import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { getDockerCommand } from "@dokploy/server/utils/builders/docker-file";
import { getStaticCommand } from "@dokploy/server/utils/builders/static";
import {
	getBuildAppDirectory,
	getDockerContextPath,
} from "@dokploy/server/utils/filesystem/directory";
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

describe("getDockerContextPath - Greptile P1 findings on #5605", () => {
	it("static builds: defaults to the build directory (code/<buildPath>), not the code root", () => {
		// getStaticCommand writes its Dockerfile into code/<buildPath> (via
		// getBuildAppDirectory) and its COPY instructions are relative to the
		// build context, so the default context must be code/<buildPath>.
		const command = getStaticCommand(
			createMockApplication({
				buildType: "static",
				buildPath: "site",
				isStaticSpa: true,
			}) as any,
		);
		expect(extractCdTarget(command)).toBe(path.join(codeRoot, "site"));
	});

	it("remote builds: resolves the context under the same root as the Dockerfile path", () => {
		// serverId null + buildServerId set: getBuildAppDirectory resolves under
		// the remote root, so the context must too (else `cd` targets a local
		// path that does not exist).
		const app = createMockApplication({
			serverId: null,
			buildServerId: "remote-server-id",
		});
		const { APPLICATIONS_PATH: REMOTE_APPLICATIONS_PATH } = paths(true);
		const dockerfilePath = getBuildAppDirectory(app as any);
		expect(dockerfilePath.startsWith(REMOTE_APPLICATIONS_PATH)).toBe(true);
		expect(getDockerContextPath(app as any)).toBe(
			path.join(REMOTE_APPLICATIONS_PATH, "test-app", "code"),
		);
	});
});
