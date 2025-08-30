import type { ApplicationNested, Domain, Redirect } from "@dokploy/server";
import { createRouterConfig } from "@dokploy/server";
import { expect, test } from "vitest";

const baseApp: ApplicationNested = {
	railpackVersion: "0.2.2",
	rollbackActive: false,
	applicationId: "",
	previewLabels: [],
	herokuVersion: "",
	giteaRepository: "",
	giteaOwner: "",
	giteaBranch: "",
	giteaBuildPath: "",
	giteaId: "",
	cleanCache: false,
	applicationStatus: "done",
	appName: "",
	autoDeploy: true,
	enableSubmodules: false,
	previewRequireCollaboratorPermissions: false,
	serverId: "",
	branch: null,
	dockerBuildStage: "",
	registryUrl: "",
	watchPaths: [],
	buildArgs: null,
	isPreviewDeploymentsActive: false,
	previewBuildArgs: null,
	triggerType: "push",
	previewCertificateType: "none",
	previewEnv: null,
	previewHttps: false,
	previewPath: "/",
	previewPort: 3000,
	previewLimit: 0,
	previewCustomCertResolver: null,
	previewWildcard: "",
	project: {
		env: "",
		organizationId: "",
		name: "",
		description: "",
		createdAt: "",
		projectId: "",
	},
	buildPath: "/",
	gitlabPathNamespace: "",
	buildType: "nixpacks",
	bitbucketBranch: "",
	bitbucketBuildPath: "",
	bitbucketId: "",
	bitbucketRepository: "",
	bitbucketOwner: "",
	githubId: "",
	gitlabProjectId: 0,
	gitlabBranch: "",
	gitlabBuildPath: "",
	gitlabId: "",
	gitlabRepository: "",
	gitlabOwner: "",
	command: null,
	cpuLimit: null,
	cpuReservation: null,
	createdAt: "",
	customGitBranch: "",
	customGitBuildPath: "",
	customGitSSHKeyId: null,
	customGitUrl: "",
	description: "",
	dockerfile: null,
	dockerImage: null,
	dropBuildPath: null,
	enabled: null,
	env: null,
	healthCheckSwarm: null,
	labelsSwarm: null,
	memoryLimit: null,
	memoryReservation: null,
	modeSwarm: null,
	mounts: [],
	name: "",
	networkSwarm: null,
	owner: null,
	password: null,
	placementSwarm: null,
	ports: [],
	projectId: "",
	publishDirectory: null,
	isStaticSpa: null,
	redirects: [],
	refreshToken: "",
	registry: null,
	registryId: null,
	replicas: 1,
	repository: null,
	restartPolicySwarm: null,
	rollbackConfigSwarm: null,
	security: [],
	sourceType: "git",
	subtitle: null,
	title: null,
	updateConfigSwarm: null,
	username: null,
	dockerContextPath: null,
};

const baseDomain: Domain = {
	applicationId: "",
	certificateType: "none",
	createdAt: "",
	domainId: "",
	host: "",
	https: false,
	path: null,
	port: null,
	serviceName: "",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 1,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
};

const baseRedirect: Redirect = {
	redirectId: "",
	regex: "",
	replacement: "",
	permanent: false,
	uniqueConfigKey: 1,
	createdAt: "",
	applicationId: "",
};

/** Middlewares */

test("Web entrypoint on http domain", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: false },
		"web",
	);

	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.rule).not.toContain("PathPrefix");
});

test("Web entrypoint on http domain with custom path", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, path: "/foo", https: false },
		"web",
	);

	expect(router.rule).toContain("PathPrefix(`/foo`)");
});

test("Web entrypoint on http domain with redirect", async () => {
	const router = await createRouterConfig(
		{
			...baseApp,
			appName: "test",
			redirects: [{ ...baseRedirect, uniqueConfigKey: 1 }],
		},
		{ ...baseDomain, https: false },
		"web",
	);

	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.middlewares).toContain("redirect-test-1");
});

test("Web entrypoint on http domain with multiple redirect", async () => {
	const router = await createRouterConfig(
		{
			...baseApp,
			appName: "test",
			redirects: [
				{ ...baseRedirect, uniqueConfigKey: 1 },
				{ ...baseRedirect, uniqueConfigKey: 2 },
			],
		},
		{ ...baseDomain, https: false },
		"web",
	);

	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.middlewares).toContain("redirect-test-1");
	expect(router.middlewares).toContain("redirect-test-2");
});

test("Web entrypoint on https domain", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: true },
		"web",
	);

	expect(router.middlewares).toContain("redirect-to-https");
});

test("Web entrypoint on https domain with redirect", async () => {
	const router = await createRouterConfig(
		{
			...baseApp,
			appName: "test",
			redirects: [{ ...baseRedirect, uniqueConfigKey: 1 }],
		},
		{ ...baseDomain, https: true },
		"web",
	);

	expect(router.middlewares).toContain("redirect-to-https");
	expect(router.middlewares).not.toContain("redirect-test-1");
});

test("Websecure entrypoint on https domain", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: true },
		"websecure",
	);

	expect(router.middlewares).not.toContain("redirect-to-https");
});

test("Websecure entrypoint on https domain with redirect", async () => {
	const router = await createRouterConfig(
		{
			...baseApp,
			appName: "test",
			redirects: [{ ...baseRedirect, uniqueConfigKey: 1 }],
		},
		{ ...baseDomain, https: true },
		"websecure",
	);

	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.middlewares).toContain("redirect-test-1");
});

/** Certificates */

test("CertificateType on websecure entrypoint", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, certificateType: "letsencrypt" },
		"websecure",
	);

	expect(router.tls?.certResolver).toBe("letsencrypt");
});
