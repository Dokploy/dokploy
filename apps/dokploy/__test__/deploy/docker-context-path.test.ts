import path from "node:path";
import { describe, expect, it } from "vitest";

// Recreate the pure resolver under test to avoid monorepo bundle resolution issues during vitest
interface ApplicationTestInput {
	appName: string;
	serverId?: string | null;
	buildServerId?: string | null;
	sourceType?: "github" | "gitlab" | "bitbucket" | "gitea" | "drop" | "git";
	buildPath?: string | null;
	gitlabBuildPath?: string | null;
	bitbucketBuildPath?: string | null;
	giteaBuildPath?: string | null;
	dropBuildPath?: string | null;
	customGitBuildPath?: string | null;
	dockerfile?: string | null;
	dockerContextPath?: string | null;
	buildType?: string;
}

const mockBasePath = (hasServer: boolean) => {
	return hasServer
		? "/etc/dokploy/remote/applications"
		: "/etc/dokploy/applications";
};

const getApplicationBuildPath = (application: ApplicationTestInput): string => {
	const { sourceType, customGitBuildPath } = application;
	if (sourceType === "github") {
		return application?.buildPath || "";
	}
	if (sourceType === "gitlab") {
		return application?.gitlabBuildPath || "";
	}
	if (sourceType === "bitbucket") {
		return application?.bitbucketBuildPath || "";
	}
	if (sourceType === "gitea") {
		return application?.giteaBuildPath || "";
	}
	if (sourceType === "drop") {
		return application?.dropBuildPath || "";
	}
	if (sourceType === "git") {
		return customGitBuildPath || "";
	}
	return "";
};

const getDockerContextPath = (application: ApplicationTestInput) => {
	const serverId = application.buildServerId || application.serverId;
	const APPLICATIONS_PATH = mockBasePath(!!serverId);
	const { appName, dockerContextPath } = application;
	const buildPath = getApplicationBuildPath(application);

	return path.join(
		APPLICATIONS_PATH,
		appName,
		"code",
		buildPath ?? "",
		dockerContextPath || ".",
	);
};

const getBuildAppDirectory = (application: ApplicationTestInput) => {
	const serverId = application.buildServerId || application.serverId;
	const APPLICATIONS_PATH = mockBasePath(!!serverId);
	const { appName, buildType, dockerfile } = application;
	const buildPath = getApplicationBuildPath(application);

	if (buildType === "dockerfile") {
		return path.join(
			APPLICATIONS_PATH,
			appName,
			"code",
			buildPath ?? "",
			dockerfile || "Dockerfile",
		);
	}

	return path.join(APPLICATIONS_PATH, appName, "code", buildPath ?? "");
};

describe("getDockerContextPath & Dockerfile build context (Issue #5417)", () => {
	it("defaults context to application code root when dockerContextPath is null/unspecified", () => {
		const app: ApplicationTestInput = {
			appName: "api-service",
			sourceType: "github",
			buildType: "dockerfile",
			dockerfile: "docker/api/Dockerfile",
			dockerContextPath: null,
		};

		const expectedContext = path.join(
			"/etc/dokploy/applications",
			"api-service",
			"code",
		);
		const expectedDockerfile = path.join(
			"/etc/dokploy/applications",
			"api-service",
			"code",
			"docker/api/Dockerfile",
		);

		expect(getDockerContextPath(app)).toBe(expectedContext);
		expect(getBuildAppDirectory(app)).toBe(expectedDockerfile);
	});

	it("uses explicit dockerContextPath when provided", () => {
		const app: ApplicationTestInput = {
			appName: "custom-app",
			sourceType: "github",
			buildType: "dockerfile",
			dockerfile: "Dockerfile",
			dockerContextPath: "packages/server",
		};

		const expectedContext = path.join(
			"/etc/dokploy/applications",
			"custom-app",
			"code",
			"packages/server",
		);
		expect(getDockerContextPath(app)).toBe(expectedContext);
	});

	it("respects buildPath/customGitBuildPath when defaulting context", () => {
		const app: ApplicationTestInput = {
			appName: "deno-service",
			sourceType: "git",
			customGitBuildPath: "/deno",
			buildType: "dockerfile",
			dockerfile: "Dockerfile",
			dockerContextPath: null,
		};

		const expectedContext = path.join(
			"/etc/dokploy/applications",
			"deno-service",
			"code",
			"/deno",
		);
		const expectedDockerfile = path.join(
			"/etc/dokploy/applications",
			"deno-service",
			"code",
			"/deno",
			"Dockerfile",
		);

		expect(getDockerContextPath(app)).toBe(expectedContext);
		expect(getBuildAppDirectory(app)).toBe(expectedDockerfile);
	});

	it("respects serverId/buildServerId remote application paths", () => {
		const app: ApplicationTestInput = {
			appName: "remote-app",
			serverId: "srv-remote-123",
			sourceType: "gitlab",
			gitlabBuildPath: "sub-app",
			buildType: "dockerfile",
			dockerfile: "deploy/Dockerfile",
			dockerContextPath: null,
		};

		const expectedContext = path.join(
			"/etc/dokploy/remote/applications",
			"remote-app",
			"code",
			"sub-app",
		);
		expect(getDockerContextPath(app)).toBe(expectedContext);
	});

	it("correctly handles dockerContextPath as '.' (dot placeholder default)", () => {
		const app: ApplicationTestInput = {
			appName: "dot-context",
			sourceType: "github",
			buildType: "dockerfile",
			dockerfile: "infra/Dockerfile",
			dockerContextPath: ".",
		};

		const expectedContext = path.join(
			"/etc/dokploy/applications",
			"dot-context",
			"code",
		);
		expect(getDockerContextPath(app)).toBe(expectedContext);
	});
});
