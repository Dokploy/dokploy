import type { ExportScope } from "@dokploy/server/services/project-export-import";
import { detectWarnings } from "@dokploy/server/services/project-export-import";
import { describe, expect, it } from "vitest";

const baseScope: ExportScope = {
	includeEnvSecrets: true,
	shared: {},
	files: {
		applicationSources: true,
		composeFiles: true,
		traefikRaw: true,
		customCertificates: true,
	},
	dumps: { mode: "none" },
	includeBackupSchedules: true,
};

const baseApplication = {
	applicationId: "app-1",
	name: "app-1",
	appName: "app-one",
	mounts: [],
	domains: [],
	isPreviewDeploymentsActive: false,
	sourceType: "github",
	autoDeploy: false,
};

const baseCompose = {
	composeId: "compose-1",
	name: "compose-1",
	appName: "compose-one",
	composeFile: "services: {}",
	mounts: [],
	domains: [],
	autoDeploy: false,
};

const emptyServiceArrays = {
	mysql: [],
	mariadb: [],
	mongo: [],
	libsql: [],
};

const buildTree = (overrides: {
	applications?: Record<string, unknown>[];
	compose?: Record<string, unknown>[];
	postgres?: Record<string, unknown>[];
	redis?: Record<string, unknown>[];
}) => ({
	projectId: "project-1",
	name: "my-project",
	organizationId: "org-1",
	env: "",
	environments: [
		{
			environmentId: "env-1",
			name: "production",
			env: "",
			applications: overrides.applications ?? [],
			compose: overrides.compose ?? [],
			postgres: overrides.postgres ?? [],
			redis: overrides.redis ?? [],
			...emptyServiceArrays,
		},
	],
});

const codesOf = (warnings: { code: string }[]) => warnings.map((w) => w.code);

describe("detectWarnings", () => {
	it("IMAGE_TAG_NOT_PINNED for a database on a floating tag, not for a pinned one", () => {
		const tree = buildTree({
			postgres: [
				{
					postgresId: "pg-1",
					name: "pg",
					appName: "pg-one",
					dockerImage: "postgres:latest",
					mounts: [],
				},
				{
					postgresId: "pg-2",
					name: "pg2",
					appName: "pg-two",
					dockerImage: "postgres:17",
					mounts: [],
				},
			],
			applications: [
				{ ...baseApplication, sourceType: "docker", dockerImage: "nginx" },
			],
		});
		const warnings = detectWarnings(tree as any, baseScope).filter(
			(w) => w.code === "IMAGE_TAG_NOT_PINNED",
		);
		expect(warnings.map((w) => w.affected[0]?.serviceId).sort()).toEqual([
			"app-1",
			"pg-1",
		]);
	});

	it("ABSOLUTE_HOST_PATH_MOUNT for a bind mount with an absolute host path", () => {
		const tree = buildTree({
			applications: [
				{
					...baseApplication,
					mounts: [
						{
							mountId: "mount-1",
							type: "bind",
							hostPath: "/var/data",
							mountPath: "/data",
						},
					],
				},
			],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("ABSOLUTE_HOST_PATH_MOUNT");
	});

	it("MANUAL_VOLUME_NAME for a volume mount with an explicit volumeName", () => {
		const tree = buildTree({
			applications: [
				{
					...baseApplication,
					mounts: [
						{
							mountId: "mount-1",
							type: "volume",
							volumeName: "my-custom-volume",
							mountPath: "/data",
						},
					],
				},
			],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("MANUAL_VOLUME_NAME");
	});

	it("does not warn about a volume name that embeds the service's own appName", () => {
		const tree = buildTree({
			applications: [
				{
					...baseApplication,
					mounts: [
						{
							mountId: "mount-1",
							type: "volume",
							volumeName: `${baseApplication.appName}-data`,
							mountPath: "/data",
						},
					],
				},
			],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).not.toContain("MANUAL_VOLUME_NAME");
	});

	it("does not warn about a bind mount with a relative path or an auto volume name", () => {
		const tree = buildTree({
			applications: [
				{
					...baseApplication,
					mounts: [
						{
							mountId: "m1",
							type: "bind",
							hostPath: "relative",
							mountPath: "/a",
						},
						{
							mountId: "m2",
							type: "volume",
							volumeName: null,
							mountPath: "/b",
						},
					],
				},
			],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).not.toContain("ABSOLUTE_HOST_PATH_MOUNT");
		expect(codesOf(warnings)).not.toContain("MANUAL_VOLUME_NAME");
	});

	it("APPNAME_IN_COMPOSE_FILE when the compose file references its own appName", () => {
		const tree = buildTree({
			compose: [
				{
					...baseCompose,
					appName: "compose-one",
					composeFile: "networks:\n  compose-one-net:\n    external: true",
				},
			],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("APPNAME_IN_COMPOSE_FILE");
	});

	it("PREVIEW_DEPLOYMENTS_DROPPED when preview deployments are active", () => {
		const tree = buildTree({
			applications: [{ ...baseApplication, isPreviewDeploymentsActive: true }],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("PREVIEW_DEPLOYMENTS_DROPPED");
	});

	it("LETSENCRYPT_CERTS_NOT_EXPORTED for a domain with a letsencrypt certificate", () => {
		const tree = buildTree({
			applications: [
				{
					...baseApplication,
					domains: [
						{
							domainId: "dom-1",
							host: "app.example.com",
							certificateType: "letsencrypt",
						},
					],
				},
			],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("LETSENCRYPT_CERTS_NOT_EXPORTED");
	});

	it("REDIS_NO_DUMP for every redis service in scope", () => {
		const tree = buildTree({
			redis: [{ redisId: "redis-1", name: "redis-1", mounts: [] }],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("REDIS_NO_DUMP");
	});

	it("WEBHOOK_TOKEN_REGENERATED for a service with autoDeploy enabled", () => {
		const tree = buildTree({
			applications: [{ ...baseApplication, autoDeploy: true }],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).toContain("WEBHOOK_TOKEN_REGENERATED");
	});

	it("DROP_SOURCE_NOT_EXPORTED when a drop-source app is excluded from files", () => {
		const tree = buildTree({
			applications: [{ ...baseApplication, sourceType: "drop" }],
		});
		const warnings = detectWarnings(tree as any, {
			...baseScope,
			files: { ...baseScope.files, applicationSources: false },
		});
		expect(codesOf(warnings)).toContain("DROP_SOURCE_NOT_EXPORTED");
	});

	it("does not warn DROP_SOURCE_NOT_EXPORTED when applicationSources is included", () => {
		const tree = buildTree({
			applications: [{ ...baseApplication, sourceType: "drop" }],
		});
		const warnings = detectWarnings(tree as any, baseScope);
		expect(codesOf(warnings)).not.toContain("DROP_SOURCE_NOT_EXPORTED");
	});

	it("only inspects services within scope", () => {
		const included = { ...baseApplication, applicationId: "app-included" };
		const excluded = {
			...baseApplication,
			applicationId: "app-excluded",
			autoDeploy: true,
		};
		const tree = buildTree({ applications: [included, excluded] });
		const warnings = detectWarnings(tree as any, {
			...baseScope,
			serviceIds: ["app-included"],
		});
		expect(codesOf(warnings)).not.toContain("WEBHOOK_TOKEN_REGENERATED");
	});
});
