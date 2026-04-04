import type { ApplicationNested, Domain, Redirect } from "@dokploy/server";
import { createRouterConfig } from "@dokploy/server";
import { expect, test } from "vitest";

const baseApp: ApplicationNested = {
	railpackVersion: "0.15.4",
	rollbackActive: false,
	applicationId: "",
	previewLabels: [],
	createEnvFile: true,
	bitbucketRepositorySlug: "",
	herokuVersion: "",
	giteaRepository: "",
	giteaOwner: "",
	giteaBranch: "",
	buildServerId: "",
	buildRegistryId: "",
	buildRegistry: null,
	giteaBuildPath: "",
	giteaId: "",
	args: [],
	rollbackRegistryId: "",
	rollbackRegistry: null,
	deployments: [],
	cleanCache: false,
	applicationStatus: "done",
	endpointSpecSwarm: null,
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
	buildSecrets: null,
	isPreviewDeploymentsActive: false,
	previewBuildArgs: null,
	previewBuildSecrets: null,
	triggerType: "push",
	previewCertificateType: "none",
	previewEnv: null,
	previewHttps: false,
	previewPath: "/",
	previewPort: 3000,
	previewLimit: 0,
	previewCustomCertResolver: null,
	previewWildcard: "",
	environmentId: "",
	environment: {
		env: "",
		isDefault: false,
		environmentId: "",
		name: "",
		createdAt: "",
		description: "",
		projectId: "",
		project: {
			env: "",
			organizationId: "",
			name: "",
			description: "",
			createdAt: "",
			projectId: "",
		},
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
	stopGracePeriodSwarm: null,
	ulimitsSwarm: null,
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
	customEntrypoint: null,
	serviceName: "",
	composeId: "",
	customCertResolver: null,
	domainType: "application",
	uniqueConfigKey: 1,
	previewDeploymentId: "",
	internalPath: "/",
	stripPath: false,
	middlewares: null,
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

/** Custom Middlewares */

test("Web entrypoint with single custom middleware", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, middlewares: ["auth@file"] },
		"web",
	);

	expect(router.middlewares).toContain("auth@file");
});

test("Web entrypoint with multiple custom middlewares", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, middlewares: ["auth@file", "rate-limit@file"] },
		"web",
	);

	expect(router.middlewares).toContain("auth@file");
	expect(router.middlewares).toContain("rate-limit@file");
});

test("Web entrypoint on https domain with custom middleware", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: true, middlewares: ["auth@file"] },
		"web",
	);

	// Should only have HTTPS redirect - custom middleware applies on websecure
	expect(router.middlewares).toContain("redirect-to-https");
	expect(router.middlewares).not.toContain("auth@file");
});

test("Websecure entrypoint with custom middleware", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: true, middlewares: ["auth@file"] },
		"websecure",
	);

	// Should have custom middleware but not HTTPS redirect
	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.middlewares).toContain("auth@file");
});

test("Web entrypoint with redirect and custom middleware", async () => {
	const router = await createRouterConfig(
		{
			...baseApp,
			appName: "test",
			redirects: [{ ...baseRedirect, uniqueConfigKey: 1 }],
		},
		{ ...baseDomain, middlewares: ["auth@file"] },
		"web",
	);

	// Should have both redirect middleware and custom middleware
	expect(router.middlewares).toContain("redirect-test-1");
	expect(router.middlewares).toContain("auth@file");
});

test("Web entrypoint with empty middlewares array", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: false, middlewares: [] },
		"web",
	);

	// Should behave same as no middlewares - no redirect for http
	expect(router.middlewares).not.toContain("redirect-to-https");
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

test("Custom entrypoint on http domain", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, https: false, customEntrypoint: "custom" },
		"custom",
	);

	expect(router.entryPoints).toEqual(["custom"]);
	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.tls).toBeUndefined();
});

test("Custom entrypoint on https domain", async () => {
	const router = await createRouterConfig(
		baseApp,
		{
			...baseDomain,
			https: true,
			customEntrypoint: "custom",
			certificateType: "letsencrypt",
		},
		"custom",
	);

	expect(router.entryPoints).toEqual(["custom"]);
	expect(router.middlewares).not.toContain("redirect-to-https");
	expect(router.tls?.certResolver).toBe("letsencrypt");
});

test("Custom entrypoint with path includes PathPrefix in rule", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, customEntrypoint: "custom", path: "/api" },
		"custom",
	);

	expect(router.rule).toContain("PathPrefix(`/api`)");
	expect(router.entryPoints).toEqual(["custom"]);
});

test("Custom entrypoint with stripPath adds stripprefix middleware", async () => {
	const router = await createRouterConfig(
		baseApp,
		{
			...baseDomain,
			customEntrypoint: "custom",
			path: "/api",
			stripPath: true,
		},
		"custom",
	);

	expect(router.middlewares).toContain("stripprefix--1");
	expect(router.entryPoints).toEqual(["custom"]);
});

test("Custom entrypoint with internalPath adds addprefix middleware", async () => {
	const router = await createRouterConfig(
		baseApp,
		{
			...baseDomain,
			customEntrypoint: "custom",
			internalPath: "/hello",
		},
		"custom",
	);

	expect(router.middlewares).toContain("addprefix--1");
	expect(router.entryPoints).toEqual(["custom"]);
});

test("Custom entrypoint with https and custom cert resolver", async () => {
	const router = await createRouterConfig(
		baseApp,
		{
			...baseDomain,
			https: true,
			customEntrypoint: "custom",
			certificateType: "custom",
			customCertResolver: "myresolver",
		},
		"custom",
	);

	expect(router.entryPoints).toEqual(["custom"]);
	expect(router.tls?.certResolver).toBe("myresolver");
});

test("Custom entrypoint without https should not have tls", async () => {
	const router = await createRouterConfig(
		baseApp,
		{
			...baseDomain,
			https: false,
			customEntrypoint: "custom",
			certificateType: "letsencrypt",
		},
		"custom",
	);

	expect(router.entryPoints).toEqual(["custom"]);
	expect(router.tls).toBeUndefined();
});

/** IDN/Punycode */

test("Internationalized domain name is converted to punycode", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, host: "тест.рф" },
		"web",
	);

	// тест.рф in punycode is xn--e1aybc.xn--p1ai
	expect(router.rule).toContain("Host(`xn--e1aybc.xn--p1ai`)");
	expect(router.rule).not.toContain("тест.рф");
});

test("ASCII domain remains unchanged", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, host: "example.com" },
		"web",
	);

	expect(router.rule).toContain("Host(`example.com`)");
});

test("Russian Cyrillic label with .ru TLD is converted to punycode", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, host: "сайт.ru" },
		"web",
	);

	// сайт in punycode is xn--80aswg
	expect(router.rule).toContain("Host(`xn--80aswg.ru`)");
	expect(router.rule).not.toContain("сайт");
});

test("Subdomain with Russian IDN TLD converts non-ASCII part to punycode", async () => {
	const router = await createRouterConfig(
		baseApp,
		{ ...baseDomain, host: "app.тест.рф" },
		"web",
	);

	// app stays ASCII, тест.рф becomes xn--e1aybc.xn--p1ai
	expect(router.rule).toContain("Host(`app.xn--e1aybc.xn--p1ai`)");
	expect(router.rule).not.toContain("тест.рф");
});
