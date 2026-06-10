import { fs, vol } from "memfs";
import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("node:fs", () => ({
	...fs,
	default: fs,
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: { findMany: vi.fn() },
			certificates: { findFirst: vi.fn() },
			compose: { findMany: vi.fn() },
		},
	},
}));

vi.mock("@dokploy/server/services/web-server-settings", () => ({
	getCaddyCompileSettings: vi.fn().mockResolvedValue({
		letsEncryptEmail: "ops@example.com",
		trustedProxies: null,
	}),
	getWebServerSettings: vi.fn().mockResolvedValue({
		letsEncryptEmail: "ops@example.com",
	}),
}));

vi.mock("@dokploy/server/utils/docker/domain", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/docker/domain")
		>();
	return {
		...actual,
		loadDockerCompose: vi.fn().mockResolvedValue(null),
		loadDockerComposeRemote: vi.fn().mockResolvedValue(null),
	};
});

const remoteDockerMock = vi.hoisted(() => ({
	listServices: vi.fn().mockResolvedValue([]),
	listContainers: vi.fn().mockResolvedValue([]),
	listTasks: vi.fn().mockResolvedValue([]),
	getContainer: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: vi.fn().mockResolvedValue(remoteDockerMock),
}));

import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { prepareCaddyMigration } from "@dokploy/server/utils/caddy/migration/prepare";

const domain = {
	domainId: "domain-1",
	host: "app.example.com",
	https: true,
	port: 3000,
	customEntrypoint: null,
	path: "/",
	serviceName: null,
	domainType: "application",
	uniqueConfigKey: 1,
	createdAt: new Date().toISOString(),
	composeId: null,
	customCertResolver: null,
	applicationId: "app-1",
	previewDeploymentId: null,
	certificateType: "letsencrypt",
	internalPath: "/",
	stripPath: false,
	middlewares: [],
};

const genericComposeFixture = [
	"services:",
	"  cms:",
	"    deploy:",
	"      labels:",
	"        - traefik.enable=true",
	"        - traefik.docker.network=dokploy-network",
	"        - traefik.http.routers.cms-prod.rule=Host(`example.com`) || Host(`www.example.com`)",
	"        - traefik.http.routers.cms-prod.entrypoints=websecure",
	"        - traefik.http.routers.cms-prod.tls.certresolver=letsencrypt",
	"        - traefik.http.routers.cms-prod.middlewares=cms-security-headers@file",
	"        - traefik.http.routers.cms-prod.service=cms-prod",
	"        - traefik.http.services.cms-prod.loadbalancer.server.port=8080",
	"  unsupported:",
	"    labels:",
	"      - traefik.http.routers.unsupported.rule=HostRegexp(`{subdomain:[a-z]+}.example.com`)",
	"      - traefik.http.routers.unsupported.entrypoints=websecure",
	"      - traefik.http.routers.unsupported.service=unsupported",
	"      - traefik.http.services.unsupported.loadbalancer.server.port=9000",
	"      - traefik.http.routers.unsupported.middlewares=plugin-only",
	"      - traefik.http.middlewares.plugin-only.plugin.demo.enabled=true",
].join("\n");

const writeCertificateFiles = (certificatePath: string) => {
	const certDir = `${paths().CERTIFICATES_PATH}/${certificatePath}`;
	vol.mkdirSync(certDir, { recursive: true });
	vol.writeFileSync(`${certDir}/chain.crt`, "cert");
	vol.writeFileSync(`${certDir}/privkey.key`, "key");
};

describe("prepareCaddyMigration", () => {
	beforeEach(() => {
		vol.reset();
		vi.clearAllMocks();
		remoteDockerMock.listServices.mockResolvedValue([]);
		remoteDockerMock.listContainers.mockResolvedValue([]);
		remoteDockerMock.listTasks.mockResolvedValue([]);
		remoteDockerMock.getContainer.mockReturnValue({
			inspect: vi.fn().mockResolvedValue({}),
		});
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{
				applicationId: "app-1",
				appName: "test-app",
				serverId: null,
				environment: { project: { organizationId: "org-1" } },
				domains: [domain],
			} as any,
		]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([]);
		vi.mocked(db.query.certificates.findFirst).mockResolvedValue(undefined);
	});

	test("writes reviewable dry-run artifacts without touching live Caddy config", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vol.writeFileSync(
			`${currentPaths.DYNAMIC_TRAEFIK_PATH}/manual.yml`,
			[
				"http:",
				"  routers:",
				"    manual:",
				"      rule: Host(`manual.example.com`)",
				"      entryPoints: [websecure]",
				"      service: manual",
				"      tls:",
				"        certResolver: letsencrypt",
				"  services:",
				"    manual:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://manual:8080",
			].join("\n"),
		);

		const report = await prepareCaddyMigration();

		expect(report.status).toBe("prepared");
		expect(report.summary.blockingWarnings).toBe(0);
		expect(report.summary.fragments).toBe(2);
		expect(report.inputs.dynamicFiles).toHaveLength(1);
		expect(vol.existsSync(report.artifactPaths.reportJson)).toBe(true);
		expect(vol.existsSync(report.artifactPaths.reportMd)).toBe(true);
		expect(vol.existsSync(report.artifactPaths.caddyJson)).toBe(true);
		expect(vol.existsSync(currentPaths.CADDY_CONFIG_PATH)).toBe(false);

		const draft = JSON.parse(
			vol.readFileSync(report.artifactPaths.caddyJson, "utf8") as string,
		) as any;
		expect(draft.apps.tls.automation.policies[0].issuers[0].email).toBe(
			"ops@example.com",
		);
		const fragmentFiles = vol.readdirSync(report.artifactPaths.fragmentsDir);
		expect(fragmentFiles).toEqual(
			expect.arrayContaining([
				"application.test-app.1.json",
				"migration.traefik-dynamic.manual.json",
			]),
		);
	});

	test("blocks DB fallback routes with missing uploaded custom certificates", async () => {
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{
				applicationId: "app-1",
				appName: "custom-cert-app",
				serverId: null,
				environment: { project: { organizationId: "org-1" } },
				domains: [
					{
						...domain,
						certificateType: "custom",
						customCertResolver: "legacy-traefik-resolver",
					},
				],
			} as any,
		]);

		const report = await prepareCaddyMigration();

		expect(report.summary.blockingWarnings).toBe(1);
		expect(report.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					blocking: true,
					code: "missing-certificate",
					source: "custom-cert-app",
					message: expect.stringContaining("legacy-traefik-resolver"),
				}),
			]),
		);
		expect(report.summary.fragments).toBe(0);
	});

	test("blocks DB fallback routes with cross-organization uploaded certificates", async () => {
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{
				applicationId: "app-1",
				appName: "custom-cert-app",
				serverId: null,
				environment: { project: { organizationId: "org-1" } },
				domains: [
					{
						...domain,
						certificateType: "custom",
						customCertResolver: "certificate-uploaded",
					},
				],
			} as any,
		]);
		vi.mocked(db.query.certificates.findFirst).mockResolvedValue({
			certificatePath: "certificate-uploaded",
			serverId: null,
			organizationId: "org-2",
		} as any);

		const report = await prepareCaddyMigration();

		expect(report.summary.blockingWarnings).toBe(1);
		expect(report.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					blocking: true,
					code: "missing-certificate",
					source: "custom-cert-app",
					message: expect.stringContaining("server and organization"),
				}),
			]),
		);
		expect(report.summary.fragments).toBe(0);
	});

	test("keeps DB fallback routes with readable uploaded custom certificates", async () => {
		writeCertificateFiles("certificate-uploaded");
		vi.mocked(db.query.applications.findMany).mockResolvedValue([
			{
				applicationId: "app-1",
				appName: "custom-cert-app",
				serverId: null,
				environment: { project: { organizationId: "org-1" } },
				domains: [
					{
						...domain,
						certificateType: "custom",
						customCertResolver: "certificate-uploaded",
					},
				],
			} as any,
		]);
		vi.mocked(db.query.certificates.findFirst).mockResolvedValue({
			certificatePath: "certificate-uploaded",
			serverId: null,
			organizationId: "org-1",
		} as any);

		const report = await prepareCaddyMigration();
		const draft = JSON.parse(
			vol.readFileSync(report.artifactPaths.caddyJson, "utf8") as string,
		) as any;
		const certificatePath = `${paths().CERTIFICATES_PATH}/certificate-uploaded`;

		expect(report.summary.blockingWarnings).toBe(0);
		expect(report.warnings).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "missing-certificate" }),
			]),
		);
		expect(report.summary.fragments).toBe(1);
		expect(draft.apps.tls.certificates.load_files).toEqual([
			{
				certificate: `${certificatePath}/chain.crt`,
				key: `${certificatePath}/privkey.key`,
			},
		]);
	});

	test("carries existing manual Caddy fragments into the migration draft", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.CADDY_FRAGMENTS_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.CADDY_FRAGMENTS_PATH}/manual.archive.json`,
			JSON.stringify(
				{
					version: 1,
					id: "manual.archive",
					source: "manual",
					routes: [
						{
							id: "archive-404",
							source: "manual",
							hosts: ["archive.example.com"],
							https: true,
							upstreams: [],
							staticResponse: { statusCode: 404 },
						},
					],
				},
				null,
				2,
			),
		);

		const report = await prepareCaddyMigration();

		expect(report.summary.blockingWarnings).toBe(0);
		expect(
			vol.existsSync(
				`${report.artifactPaths.fragmentsDir}/manual.archive.json`,
			),
		).toBe(true);
		const draft = JSON.parse(
			vol.readFileSync(report.artifactPaths.caddyJson, "utf8") as string,
		) as any;
		const archiveRoute = draft.apps.http.servers.https.routes.find(
			(item: any) => JSON.stringify(item.match).includes("archive.example.com"),
		);
		expect(archiveRoute.handle[0]).toMatchObject({
			handler: "static_response",
			status_code: 404,
		});
	});

	test("blocks carried manual Caddy fragments that overlap generated migration routes", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.CADDY_FRAGMENTS_PATH, { recursive: true });
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.CADDY_FRAGMENTS_PATH}/manual.conflict.json`,
			JSON.stringify(
				{
					version: 1,
					id: "manual.conflict",
					source: "manual",
					routes: [
						{
							id: "manual-conflict",
							source: "manual",
							hosts: ["manual.example.com"],
							https: true,
							upstreams: [],
							staticResponse: { statusCode: 404 },
						},
					],
				},
				null,
				2,
			),
		);
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vol.writeFileSync(
			`${currentPaths.DYNAMIC_TRAEFIK_PATH}/manual.yml`,
			[
				"http:",
				"  routers:",
				"    manual:",
				"      rule: Host(`manual.example.com`)",
				"      entryPoints: [websecure]",
				"      service: manual",
				"      tls:",
				"        certResolver: letsencrypt",
				"  services:",
				"    manual:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://manual:8080",
			].join("\n"),
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);

		const report = await prepareCaddyMigration();

		expect(report.summary.blockingWarnings).toBe(1);
		expect(report.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "conflicting-manual-fragment",
					source: "manual.conflict",
					blocking: true,
				}),
			]),
		);
		expect(vol.readFileSync(report.artifactPaths.reportMd, "utf8")).toContain(
			"conflicting-manual-fragment",
		);
	});

	test("reports compose-label warnings with source references during dry run", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vol.writeFileSync(
			`${currentPaths.DYNAMIC_TRAEFIK_PATH}/middlewares.yml`,
			[
				"http:",
				"  middlewares:",
				"    cms-security-headers:",
				"      headers:",
				"        stsSeconds: 31536000",
				"        stsIncludeSubdomains: true",
				"        stsPreload: true",
				"        referrerPolicy: strict-origin-when-cross-origin",
				"        contentTypeNosniff: true",
			].join("\n"),
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([
			{
				appName: "generic-fixture",
				serverId: null,
				composeFile: genericComposeFixture,
				composeType: "docker-compose",
				randomize: false,
				isolatedDeployment: false,
				suffix: null,
				domains: [],
			} as any,
		]);

		const report = await prepareCaddyMigration();

		expect(report.inputs.composeFilesScanned).toEqual(["generic-fixture"]);
		expect(report.summary.fragments).toBe(1);
		expect(report.summary.blockingWarnings).toBeGreaterThan(0);
		expect(report.warnings).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "unresolved-middleware",
					source: "generic-fixture/cms/deploy.labels",
					middlewareName: "cms-security-headers@file",
				}),
			]),
		);
		expect(report.warnings).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					code: "unsupported-matcher",
					source: "generic-fixture/unsupported/labels",
					routerName: "unsupported",
					blocking: true,
				}),
			]),
		);

		const reportJson = JSON.parse(
			vol.readFileSync(report.artifactPaths.reportJson, "utf8") as string,
		);
		expect(reportJson.inputs.composeFilesScanned).toEqual(["generic-fixture"]);
		const reportMd = vol.readFileSync(
			report.artifactPaths.reportMd,
			"utf8",
		) as string;
		expect(reportMd).toContain("Blocking warnings");
		expect(reportMd).not.toContain("cms-security-headers@file");
		expect(reportMd).toContain("generic-fixture/unsupported/labels");
	});

	test("normalizes dynamic-file upstream URLs with default scheme ports", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vol.writeFileSync(
			`${currentPaths.DYNAMIC_TRAEFIK_PATH}/admin.yml`,
			[
				"http:",
				"  routers:",
				"    admin:",
				"      rule: Host(`admin.example.com`)",
				"      entryPoints: [websecure]",
				"      service: admin",
				"      tls:",
				"        certResolver: letsencrypt",
				"  services:",
				"    admin:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://admin",
			].join("\n"),
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);

		const report = await prepareCaddyMigration();

		expect(report.validation.status).toBe("passed");
		expect(report.summary.blockingWarnings).toBe(0);
		expect(report.warnings).toEqual([]);
		expect(vol.readFileSync(report.artifactPaths.caddyJson, "utf8")).toContain(
			'"dial": "admin:80"',
		);
	});

	test("preserves generated-only compose label IP restrictions before discarding generated labels", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vol.writeFileSync(
			`${currentPaths.DYNAMIC_TRAEFIK_PATH}/middlewares.yml`,
			[
				"http:",
				"  middlewares:",
				"    internal-allowlist:",
				"      ipAllowList:",
				"        sourceRange:",
				"          - 192.0.2.0/24",
			].join("\n"),
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([
			{
				appName: "sample-dashboard",
				serverId: null,
				composeFile: [
					"services:",
					"  dash-api:",
					"    image: dash",
					"    labels:",
					"      - traefik.enable=true",
					"      - traefik.docker.network=dokploy-network",
					"      - traefik.http.routers.sample-dashboard-42-websecure.rule=Host(`dashboard.example.com`)",
					"      - traefik.http.routers.sample-dashboard-42-websecure.entrypoints=websecure",
					"      - traefik.http.routers.sample-dashboard-42-websecure.tls.certresolver=letsencrypt",
					"      - traefik.http.routers.sample-dashboard-42-websecure.middlewares=internal-allowlist@file",
					"      - traefik.http.routers.sample-dashboard-42-websecure.service=sample-dashboard-42-websecure",
					"      - traefik.http.services.sample-dashboard-42-websecure.loadbalancer.server.port=8000",
				].join("\n"),
				composeType: "docker-compose",
				randomize: false,
				isolatedDeployment: false,
				suffix: null,
				domains: [
					{
						...domain,
						domainId: "dash-domain",
						applicationId: null,
						composeId: "dash-compose",
						domainType: "compose",
						host: "dashboard.example.com",
						port: 8000,
						serviceName: "dash-api",
						uniqueConfigKey: 42,
					},
				],
			} as any,
		]);

		const report = await prepareCaddyMigration();

		expect(report.summary.blockingWarnings).toBe(0);
		expect(report.warnings).toEqual([
			expect.objectContaining({
				code: "shadowed-route",
				blocking: false,
			}),
		]);
		expect(report.summary.fragments).toBe(1);
		const caddyJson = vol.readFileSync(report.artifactPaths.caddyJson, "utf8");
		expect(caddyJson).toContain('"remote_ip"');
		expect(caddyJson).toContain('"status_code": 403');
	});

	test("skips live Docker Traefik label services with no running tasks", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([]);
		remoteDockerMock.listServices.mockResolvedValue([
			{
				ID: "stopped-service-id",
				Spec: {
					Name: "stopped-stack_web",
					Mode: { Replicated: { Replicas: 1 } },
					Labels: {
						"traefik.http.routers.stopped.rule": "Host(`stopped.example.com`)",
						"traefik.http.routers.stopped.entrypoints": "websecure",
						"traefik.http.routers.stopped.service": "stopped",
						"traefik.http.routers.stopped.tls.certresolver": "letsencrypt",
						"traefik.http.services.stopped.loadbalancer.server.port": "8080",
					},
				},
			},
			{
				ID: "running-service-id",
				Spec: {
					Name: "running-stack_web",
					Mode: { Replicated: { Replicas: 1 } },
					Labels: {
						"traefik.http.routers.running.rule": "Host(`running.example.com`)",
						"traefik.http.routers.running.entrypoints": "websecure",
						"traefik.http.routers.running.service": "running",
						"traefik.http.routers.running.tls.certresolver": "letsencrypt",
						"traefik.http.services.running.loadbalancer.server.port": "8080",
					},
				},
			},
		]);
		remoteDockerMock.listTasks.mockResolvedValue([
			{
				ServiceID: "running-service-id",
				DesiredState: "running",
				Status: { State: "running" },
			},
		]);

		const report = await prepareCaddyMigration();
		const caddyJson = vol.readFileSync(report.artifactPaths.caddyJson, "utf8");

		expect(report.summary.blockingWarnings).toBe(0);
		expect(caddyJson).toContain("running.example.com");
		expect(caddyJson).toContain("running-stack_web:8080");
		expect(caddyJson).not.toContain("stopped.example.com");
		expect(caddyJson).not.toContain("stopped-stack_web:8080");
	});

	test("uses inspected container network aliases for reachability checks", async () => {
		const currentPaths = paths();
		vol.mkdirSync(currentPaths.DYNAMIC_TRAEFIK_PATH, { recursive: true });
		vol.writeFileSync(
			`${currentPaths.MAIN_TRAEFIK_PATH}/traefik.yml`,
			"entryPoints:\n  web:\n    address: ':80'\n",
		);
		vol.writeFileSync(
			`${currentPaths.DYNAMIC_TRAEFIK_PATH}/admin.yml`,
			[
				"http:",
				"  routers:",
				"    admin:",
				"      rule: Host(`admin.example.com`)",
				"      entryPoints: [websecure]",
				"      service: admin",
				"      tls:",
				"        certResolver: letsencrypt",
				"  services:",
				"    admin:",
				"      loadBalancer:",
				"        servers:",
				"          - url: http://admin:80",
			].join("\n"),
		);
		vi.mocked(db.query.applications.findMany).mockResolvedValue([]);
		vi.mocked(db.query.compose.findMany).mockResolvedValue([]);
		remoteDockerMock.listContainers.mockResolvedValue([
			{
				Id: "traefik-container",
				Names: ["/dokploy-traefik"],
				NetworkSettings: { Networks: {} },
				Labels: {},
			},
			{
				Id: "admin-container",
				Names: ["/admin-console-admin-1"],
				NetworkSettings: { Networks: {} },
				Labels: {},
			},
		]);
		remoteDockerMock.getContainer.mockImplementation((id: string) => ({
			inspect: vi.fn().mockResolvedValue(
				id === "admin-container"
					? {
							NetworkSettings: {
								Networks: {
									"dokploy-network": {
										Aliases: ["admin-console-admin-1", "admin"],
									},
								},
							},
						}
					: {
							NetworkSettings: {
								Networks: {
									"dokploy-network": { Aliases: ["dokploy-traefik"] },
								},
							},
						},
			),
		}));

		const report = await prepareCaddyMigration();

		expect(report.summary.blockingWarnings).toBe(0);
		expect(report.warnings).not.toEqual(
			expect.arrayContaining([
				expect.objectContaining({ code: "unreachable-upstream" }),
			]),
		);
		expect(vol.readFileSync(report.artifactPaths.caddyJson, "utf8")).toContain(
			'"dial": "admin:80"',
		);
	});
});
