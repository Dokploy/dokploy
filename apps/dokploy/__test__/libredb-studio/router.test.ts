import { createHash } from "node:crypto";
import { db } from "@dokploy/server/db";
import { getLibreDBStudioImage } from "@dokploy/server/utils/libredb-studio/constants";
import { readEnvVar } from "@dokploy/server/utils/libredb-studio/env";
import { LIBREDB_STUDIO_ICON_DATA_URL } from "@dokploy/server/utils/libredb-studio/icon";
import { TRPCError } from "@trpc/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applications } from "@/server/db/schema";

const cloud = vi.hoisted(() => ({ enabled: false }));

const server = vi.hoisted(() => ({
	createApplication: vi.fn(),
	createDomain: vi.fn(),
	createMount: vi.fn(),
	deleteAllMiddlewares: vi.fn(),
	findApplicationById: vi.fn(),
	findEnvironmentById: vi.fn(),
	findLibsqlById: vi.fn(),
	findMariadbById: vi.fn(),
	findMongoById: vi.fn(),
	findMySqlById: vi.fn(),
	findOrganizationById: vi.fn(),
	findPostgresById: vi.fn(),
	findProjectById: vi.fn(),
	findRedisById: vi.fn(),
	findServerById: vi.fn(),
	generateTraefikMeDomain: vi.fn(),
	getAccessibleServerIds: vi.fn(),
	getDomainHost: vi.fn(),
	getWebServerSettings: vi.fn(),
	removeDeployments: vi.fn(),
	removeDirectoryCode: vi.fn(),
	removeMonitoringDirectory: vi.fn(),
	removeService: vi.fn(),
	removeTraefikConfig: vi.fn(),
	updateApplication: vi.fn(),
}));

const permission = vi.hoisted(() => ({
	addNewService: vi.fn(),
	checkEnvironmentAccess: vi.fn(),
	checkPermission: vi.fn(),
	checkServiceAccess: vi.fn(),
}));

const studioService = vi.hoisted(() => ({
	createLibreDBStudio: vi.fn(),
	findLibreDBStudioByApplicationId: vi.fn(),
	findLibreDBStudiosByEnvironment: vi.fn(),
	findLibreDBStudiosByScope: vi.fn(),
	getLibreDBStudioView: vi.fn(),
	syncLibreDBStudio: vi.fn(),
	withLibreDBStudioScopeLock: vi.fn(),
}));

const studioHost = vi.hoisted(() => ({
	isHostUsedByAnotherService: vi.fn(),
}));

const audit = vi.hoisted(() => vi.fn());

const queue = vi.hoisted(() => ({
	cleanQueuesByApplication: vi.fn(),
	myQueue: { add: vi.fn() },
}));

vi.mock("@dokploy/server", () => ({
	get IS_CLOUD() {
		return cloud.enabled;
	},
	...server,
}));

vi.mock("@dokploy/server/services/permission", () => permission);

vi.mock("@dokploy/server/services/libredb-studio", () => studioService);

vi.mock("@dokploy/server/utils/libredb-studio/host", () => studioHost);

vi.mock("@dokploy/server/lib/auth", () => ({
	validateRequest: vi.fn(),
}));

vi.mock("@/server/api/utils/audit", () => ({ audit }));

vi.mock("@/server/queues/queueSetup", () => queue);

const { libredbStudioRouter } = await import(
	"@/server/api/routers/libredb-studio"
);

const caller = (role = "owner") =>
	libredbStudioRouter.createCaller({
		session: { activeOrganizationId: "org-1", userId: "user-1" },
		user: {
			id: "user-1",
			email: `${role}@example.com`,
			role,
			ownerId: "owner-1",
		},
	} as Parameters<typeof libredbStudioRouter.createCaller>[0]);

const denied = (message = "Permission denied") =>
	new TRPCError({ code: "UNAUTHORIZED", message });

const APP_NAME = "demo-shop-libredb-studio-abc123";
const GENERATED_HOST = `${APP_NAME}-1a2b3c-203-0-113-10.sslip.io`;
const NO_SERVER_IP_MESSAGE =
	"This server has no IP address to build a generated domain from. Use a custom domain.";
const STUDIO_SECRETS = {
	launchSecret: "l".repeat(64),
	jwtSecret: "j".repeat(64),
	adminPassword: "p".repeat(24),
};

const studioRow = (libredbStudioId: string, applicationId: string) => ({
	libredbStudioId,
	applicationId,
	allowCustomConnections: false,
	seedHash: null,
	lastSyncedAt: null,
	lastSyncError: null,
	...STUDIO_SECRETS,
	createdAt: "2026-10-03T00:00:00.000Z",
	application: {
		applicationId,
		appName: APP_NAME,
		environmentId: "env-1",
		serverId: null,
		environment: {
			projectId: "project-1",
			project: { organizationId: "org-1" },
		},
	},
});

const studioView = (libredbStudioId: string, applicationId = "app-1") => ({
	libredbStudioId,
	applicationId,
	name: "LibreDB Studio",
	appName: APP_NAME,
	environmentId: "env-1",
	projectId: "project-1",
	serverId: null,
	serverName: null,
	applicationStatus: "done",
	url: `http://${GENERATED_HOST}`,
	https: false,
	image: "ghcr.io/libredb/libredb-studio:0.18.0",
	recommendedImage: "ghcr.io/libredb/libredb-studio:0.18.0",
	updateAvailable: false,
	belowMinimumVersion: false,
	allowCustomConnections: false,
	cookieSettingMismatch: false,
	lastSyncedAt: null,
	lastSyncError: null,
	covered: [],
	excluded: [],
});

const installGenerated = () =>
	caller().install({ environmentId: "env-1", domain: { kind: "generated" } });

const savedSettings = () => server.updateApplication.mock.calls[0]?.[1];

beforeEach(() => {
	vi.resetAllMocks();
	cloud.enabled = false;
	vi.stubEnv("NODE_ENV", "production");

	server.findEnvironmentById.mockResolvedValue({
		environmentId: "env-1",
		projectId: "project-1",
		project: { projectId: "project-1", organizationId: "org-1" },
	});
	server.findProjectById.mockResolvedValue({
		projectId: "project-1",
		name: "Demo Shop",
		organizationId: "org-1",
	});
	server.getWebServerSettings.mockResolvedValue({
		remoteServersOnly: false,
		serverIp: "203.0.113.10",
	});
	server.getAccessibleServerIds.mockResolvedValue(new Set(["server-1"]));
	server.findServerById.mockResolvedValue({
		serverId: "server-1",
		ipAddress: "203.0.113.20",
	});
	server.createApplication.mockImplementation(async (input) => ({
		applicationId: "app-1",
		appName: APP_NAME,
		serverId: input.serverId ?? null,
	}));
	server.generateTraefikMeDomain.mockResolvedValue(GENERATED_HOST);
	server.createDomain.mockImplementation(async (input) => ({
		domainId: "domain-1",
		...input,
	}));
	server.getDomainHost.mockImplementation(
		(domain) => `${domain.https ? "https" : "http"}://${domain.host}`,
	);
	server.findApplicationById.mockResolvedValue({
		applicationId: "app-1",
		appName: APP_NAME,
		serverId: null,
		security: [],
		redirects: [],
	});
	studioService.withLibreDBStudioScopeLock.mockImplementation(
		async (_scope, fn) => fn(),
	);
	studioService.findLibreDBStudiosByScope.mockResolvedValue([]);
	studioService.createLibreDBStudio.mockResolvedValue({
		libredbStudioId: "studio-1",
		applicationId: "app-1",
	});
	studioService.syncLibreDBStudio.mockResolvedValue({
		changed: true,
		networksChanged: false,
	});
	queue.myQueue.add.mockResolvedValue({ id: "job-1" });
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

describe("libredbStudio router OpenAPI exposure", () => {
	it("disables OpenAPI on every procedure", () => {
		const procedures = Object.entries(libredbStudioRouter._def.procedures);
		expect(procedures.length).toBeGreaterThan(0);
		for (const [name, procedure] of procedures) {
			const meta = (
				procedure as { _def: { meta?: { openapi?: { enabled?: boolean } } } }
			)._def.meta;
			expect({ name, enabled: meta?.openapi?.enabled }).toEqual({
				name,
				enabled: false,
			});
		}
	});
});

describe("libredbStudio router on Dokploy Cloud", () => {
	it.each([
		["install", () => installGenerated()],
		["byEnvironment", () => caller().byEnvironment({ environmentId: "env-1" })],
		["byApplication", () => caller().byApplication({ applicationId: "app-1" })],
		[
			"forDatabase",
			() =>
				caller().forDatabase({
					databaseType: "postgres",
					databaseId: "postgres-1",
				}),
		],
	])("refuses %s", async (_name, call) => {
		cloud.enabled = true;

		await expect(call()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "LibreDB Studio is not available on Dokploy Cloud",
		});
		expect(server.findEnvironmentById).not.toHaveBeenCalled();
		expect(permission.checkServiceAccess).not.toHaveBeenCalled();
	});
});

describe("libredbStudio.install", () => {
	const expectNothingInstalled = () => {
		expect(studioService.withLibreDBStudioScopeLock).not.toHaveBeenCalled();
		expect(server.createApplication).not.toHaveBeenCalled();
		expect(server.updateApplication).not.toHaveBeenCalled();
		expect(server.createMount).not.toHaveBeenCalled();
		expect(studioService.createLibreDBStudio).not.toHaveBeenCalled();
		expect(permission.addNewService).not.toHaveBeenCalled();
		expect(server.generateTraefikMeDomain).not.toHaveBeenCalled();
		expect(server.createDomain).not.toHaveBeenCalled();
		expect(studioService.syncLibreDBStudio).not.toHaveBeenCalled();
		expect(queue.myQueue.add).not.toHaveBeenCalled();
		expect(audit).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
		expect(db.update).not.toHaveBeenCalled();
		expect(db.delete).not.toHaveBeenCalled();
	};

	it("creates the Studio application with a generated HTTP domain and queues its deploy", async () => {
		const result = await installGenerated();

		expect(server.createApplication).toHaveBeenCalledWith({
			name: "LibreDB Studio",
			appName: "demo-shop-libredb-studio",
			description:
				"Managed by the LibreDB Studio integration. Do not change the image or networks by hand.",
			environmentId: "env-1",
			serverId: undefined,
			sourceType: "docker",
		});
		expect(server.updateApplication).toHaveBeenCalledWith(
			"app-1",
			expect.objectContaining({
				sourceType: "docker",
				dockerImage: getLibreDBStudioImage(),
				icon: LIBREDB_STUDIO_ICON_DATA_URL,
				replicas: 1,
				healthCheckSwarm: {
					Test: [
						"CMD",
						"node",
						"-e",
						"fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
					],
					Interval: 30_000_000_000,
					Timeout: 5_000_000_000,
					StartPeriod: 15_000_000_000,
					Retries: 3,
				},
				updateConfigSwarm: {
					Parallelism: 1,
					Order: "stop-first",
					FailureAction: "rollback",
				},
				rollbackConfigSwarm: { Parallelism: 1, Order: "stop-first" },
			}),
		);

		const env = savedSettings().env;
		expect(readEnvVar(env, "ADMIN_EMAIL")).toBe("admin@studio.invalid");
		expect(readEnvVar(env, "STORAGE_PROVIDER")).toBe("sqlite");
		expect(readEnvVar(env, "STORAGE_SQLITE_PATH")).toBe(
			"/app/data/libredb-storage.db",
		);
		expect(readEnvVar(env, "LIBREDB_EMBEDDED_SAMPLE")).toBe("false");
		expect(readEnvVar(env, "SQLITE_EMBEDDED_SAMPLE")).toBe("false");
		expect(readEnvVar(env, "AUTH_COOKIE_SECURE")).toBe("false");

		expect(server.createMount).toHaveBeenCalledWith({
			serviceId: "app-1",
			serviceType: "application",
			type: "volume",
			volumeName: `${APP_NAME}-data`,
			mountPath: "/app/data",
		});
		expect(studioService.createLibreDBStudio).toHaveBeenCalledWith({
			applicationId: "app-1",
			launchSecret: expect.stringMatching(/^[0-9a-f]{64}$/),
			jwtSecret: expect.stringMatching(/^[A-Za-z0-9_-]{64}$/),
			adminPassword: expect.stringMatching(/^[A-Za-z0-9_-]{24}$/),
		});
		expect(permission.addNewService).toHaveBeenCalledWith(
			expect.objectContaining({
				user: expect.objectContaining({ id: "user-1" }),
			}),
			"app-1",
		);
		expect(server.generateTraefikMeDomain).toHaveBeenCalledWith(
			APP_NAME,
			"owner-1",
			undefined,
		);
		expect(server.createDomain).toHaveBeenCalledWith({
			host: GENERATED_HOST,
			port: 3000,
			https: false,
			certificateType: "none",
			applicationId: "app-1",
			domainType: "application",
		});
		expect(studioService.syncLibreDBStudio).toHaveBeenCalledWith("studio-1", {
			force: true,
		});
		expect(queue.myQueue.add).toHaveBeenCalledWith(
			"deployments",
			{
				applicationId: "app-1",
				titleLog: "LibreDB Studio installation",
				descriptionLog: "",
				type: "deploy",
				applicationType: "application",
				server: false,
				serverId: undefined,
			},
			{ removeOnComplete: true, removeOnFail: true },
		);
		expect(audit).toHaveBeenCalledWith(expect.anything(), {
			action: "create",
			resourceType: "application",
			resourceId: "app-1",
			resourceName: APP_NAME,
		});
		expect(audit).toHaveBeenCalledWith(expect.anything(), {
			action: "deploy",
			resourceType: "application",
			resourceId: "app-1",
			resourceName: APP_NAME,
		});
		expect(result).toEqual({
			libredbStudioId: "studio-1",
			applicationId: "app-1",
			url: `http://${GENERATED_HOST}`,
		});
	});

	it("keeps every Studio secret out of the application env and the result", async () => {
		const result = await installGenerated();

		const settings = savedSettings();
		expect(
			settings.env
				.split("\n")
				.map((line: string) => line.slice(0, line.indexOf("="))),
		).toEqual([
			"ADMIN_EMAIL",
			"STORAGE_PROVIDER",
			"STORAGE_SQLITE_PATH",
			"LIBREDB_EMBEDDED_SAMPLE",
			"SQLITE_EMBEDDED_SAMPLE",
			"AUTH_COOKIE_SECURE",
		]);
		for (const key of ["JWT_SECRET", "ADMIN_PASSWORD", "LAUNCH_TOKEN_SECRET"]) {
			expect(readEnvVar(settings.env, key)).toBeNull();
		}
		const { launchSecret, jwtSecret, adminPassword } =
			studioService.createLibreDBStudio.mock.calls[0]?.[0];
		const written = JSON.stringify([
			server.updateApplication.mock.calls,
			server.createDomain.mock.calls,
			server.createMount.mock.calls,
			result,
		]);
		for (const secret of [launchSecret, jwtSecret, adminPassword]) {
			expect(secret).toEqual(expect.any(String));
			expect(written).not.toContain(secret);
		}
	});

	it("generates the three Studio secrets with crypto.randomBytes, not Math.random", async () => {
		vi.spyOn(Math, "random").mockReturnValue(0);

		await installGenerated();
		await installGenerated();

		const [first, second] = studioService.createLibreDBStudio.mock.calls.map(
			([input]) => input,
		);
		for (const secrets of [first, second]) {
			expect(secrets.launchSecret).toMatch(/^[0-9a-f]{64}$/);
			expect(secrets.jwtSecret).toMatch(/^[A-Za-z0-9_-]{64}$/);
			expect(secrets.adminPassword).toMatch(/^[A-Za-z0-9_-]{24}$/);
		}
		expect(second.launchSecret).not.toBe(first.launchSecret);
		expect(second.jwtSecret).not.toBe(first.jwtSecret);
		expect(second.adminPassword).not.toBe(first.adminPassword);
	});

	it.each(["owner", "admin", "member", "deployer"])(
		"writes ADMIN_EMAIL=admin@studio.invalid for an install by role %s",
		async (role) => {
			await caller(role).install({
				environmentId: "env-1",
				domain: { kind: "generated" },
			});

			expect(readEnvVar(savedSettings().env, "ADMIN_EMAIL")).toBe(
				"admin@studio.invalid",
			);
			expect(server.findOrganizationById).not.toHaveBeenCalled();
		},
	);

	it("uses a custom HTTPS domain and leaves AUTH_COOKIE_SECURE unset", async () => {
		const result = await caller().install({
			environmentId: "env-1",
			domain: { kind: "custom", host: "studio.example.com" },
		});

		expect(server.generateTraefikMeDomain).not.toHaveBeenCalled();
		expect(server.createDomain).toHaveBeenCalledWith({
			host: "studio.example.com",
			port: 3000,
			https: true,
			certificateType: "letsencrypt",
			applicationId: "app-1",
			domainType: "application",
		});
		expect(readEnvVar(savedSettings().env, "AUTH_COOKIE_SECURE")).toBeNull();
		expect(result.url).toBe("https://studio.example.com");
	});

	it.each([
		["the Dokploy server", undefined, null],
		["a remote server", "server-1", "server-1"],
	])(
		"refuses a custom host another service on %s already uses, before any write",
		async (_name, serverId, expectedServerId) => {
			studioHost.isHostUsedByAnotherService.mockResolvedValue(true);

			await expect(
				caller().install({
					environmentId: "env-1",
					serverId,
					domain: { kind: "custom", host: "shared.example.com" },
				}),
			).rejects.toMatchObject({
				code: "CONFLICT",
				message:
					"Another service already uses this domain. Choose a domain that only the Studio uses.",
			});
			expect(studioHost.isHostUsedByAnotherService).toHaveBeenCalledWith({
				host: "shared.example.com",
				serverId: expectedServerId,
			});
			expectNothingInstalled();
		},
	);

	it("does not look up other services for a generated domain", async () => {
		await installGenerated();
		expect(studioHost.isHostUsedByAnotherService).not.toHaveBeenCalled();
	});

	it("scopes the lock, the application, the domain and the deploy to the chosen server", async () => {
		await caller().install({
			environmentId: "env-1",
			serverId: "server-1",
			domain: { kind: "generated" },
		});

		expect(server.findServerById).toHaveBeenCalledWith("server-1");
		expect(studioService.withLibreDBStudioScopeLock).toHaveBeenCalledWith(
			{ environmentId: "env-1", serverId: "server-1" },
			expect.any(Function),
		);
		expect(studioService.findLibreDBStudiosByScope).toHaveBeenCalledWith({
			environmentId: "env-1",
			serverId: "server-1",
		});
		expect(server.createApplication).toHaveBeenCalledWith(
			expect.objectContaining({ serverId: "server-1" }),
		);
		expect(server.generateTraefikMeDomain).toHaveBeenCalledWith(
			APP_NAME,
			"owner-1",
			"server-1",
		);
		expect(queue.myQueue.add).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({ server: true, serverId: "server-1" }),
			{ removeOnComplete: true, removeOnFail: true },
		);
	});

	it("shortens a long project slug so the final appName fits a Swarm service name", async () => {
		server.findProjectById.mockResolvedValue({
			projectId: "project-1",
			name: "Payments Platform Staging Environment in the EU Region",
			organizationId: "org-1",
		});

		await installGenerated();

		const appName = server.createApplication.mock.calls[0]?.[0].appName;
		expect(appName).toBe(
			"payments-platform-staging-environment-in-libredb-studio",
		);
		expect(`${appName}-abc123`.length).toBeLessThanOrEqual(63);
	});

	it("refuses a project of another organization", async () => {
		server.findProjectById.mockResolvedValue({
			projectId: "project-1",
			name: "Demo Shop",
			organizationId: "org-2",
		});

		await expect(installGenerated()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this project",
		});
		expect(server.createApplication).not.toHaveBeenCalled();
	});

	it("refuses a caller without service.create on the project", async () => {
		permission.checkServiceAccess.mockRejectedValue(
			denied("You don't have access to this project"),
		);

		await expect(installGenerated()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You don't have access to this project",
		});
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"project-1",
			"create",
		);
		expect(server.createApplication).not.toHaveBeenCalled();
	});

	it("refuses a caller without deployment.create", async () => {
		permission.checkPermission.mockImplementation(async (_ctx, permissions) => {
			if (permissions.deployment?.includes("create")) {
				throw denied();
			}
		});

		await expect(installGenerated()).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "Permission denied",
		});
		expect(permission.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			deployment: ["create"],
		});
		expect(server.createApplication).not.toHaveBeenCalled();
	});

	it("refuses a member without read access to the environment before creating anything", async () => {
		permission.checkEnvironmentAccess.mockRejectedValue(
			denied("You don't have access to this environment"),
		);

		await expect(
			caller("member").install({
				environmentId: "env-1",
				domain: { kind: "generated" },
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You don't have access to this environment",
		});
		expect(permission.checkEnvironmentAccess).toHaveBeenCalledWith(
			expect.anything(),
			"env-1",
			"read",
		);
		expectNothingInstalled();
	});

	it("refuses a server the caller cannot access", async () => {
		server.getAccessibleServerIds.mockResolvedValue(new Set(["server-2"]));

		await expect(
			caller().install({
				environmentId: "env-1",
				serverId: "server-1",
				domain: { kind: "generated" },
			}),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
		expect(server.findServerById).not.toHaveBeenCalled();
		expect(server.createApplication).not.toHaveBeenCalled();
	});

	it("requires a server when only remote servers may run services", async () => {
		server.getWebServerSettings.mockResolvedValue({ remoteServersOnly: true });

		await expect(installGenerated()).rejects.toMatchObject({
			code: "BAD_REQUEST",
			message: "You need to use a server to install LibreDB Studio",
		});
		expect(server.createApplication).not.toHaveBeenCalled();
	});

	describe("with a generated domain on a server without an IP address", () => {
		it.each([[null], [""], ["   "]])(
			"refuses the Dokploy host with the server IP %j and creates nothing",
			async (serverIp) => {
				server.getWebServerSettings.mockResolvedValue({
					remoteServersOnly: false,
					serverIp,
				});

				await expect(installGenerated()).rejects.toMatchObject({
					code: "BAD_REQUEST",
					message: NO_SERVER_IP_MESSAGE,
				});
				expectNothingInstalled();
			},
		);

		it("refuses a remote server without an IP address and creates nothing", async () => {
			server.findServerById.mockResolvedValue({
				serverId: "server-1",
				ipAddress: "",
			});

			await expect(
				caller().install({
					environmentId: "env-1",
					serverId: "server-1",
					domain: { kind: "generated" },
				}),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				message: NO_SERVER_IP_MESSAGE,
			});
			expect(server.findServerById).toHaveBeenCalledWith("server-1");
			expectNothingInstalled();
		});

		it("installs in development, where the 127.0.0.1 address reaches the local Dokploy", async () => {
			vi.stubEnv("NODE_ENV", "development");
			server.getWebServerSettings.mockResolvedValue({
				remoteServersOnly: false,
				serverIp: null,
			});

			await expect(installGenerated()).resolves.toMatchObject({
				libredbStudioId: "studio-1",
			});
			expect(server.generateTraefikMeDomain).toHaveBeenCalledWith(
				APP_NAME,
				"owner-1",
				undefined,
			);
		});

		it("installs with a custom domain instead", async () => {
			server.getWebServerSettings.mockResolvedValue({
				remoteServersOnly: false,
				serverIp: null,
			});

			await expect(
				caller().install({
					environmentId: "env-1",
					domain: { kind: "custom", host: "studio.example.com" },
				}),
			).resolves.toMatchObject({ url: "https://studio.example.com" });
			expect(server.createApplication).toHaveBeenCalledTimes(1);
		});
	});

	it("refuses a second Studio for the same environment and server", async () => {
		studioService.findLibreDBStudiosByScope.mockResolvedValue([
			studioRow("studio-0", "app-0"),
		]);

		await expect(installGenerated()).rejects.toMatchObject({
			code: "CONFLICT",
			message:
				"A LibreDB Studio already exists for this environment and server",
		});
		expect(server.createApplication).not.toHaveBeenCalled();
	});

	it("rejects a custom host that is not a valid hostname", async () => {
		await expect(
			caller().install({
				environmentId: "env-1",
				domain: { kind: "custom", host: "not a host" },
			}),
		).rejects.toMatchObject({ code: "BAD_REQUEST" });
		expect(server.findEnvironmentById).not.toHaveBeenCalled();
	});

	it("does not clean up when the application itself could not be created", async () => {
		server.createApplication.mockRejectedValue(
			new TRPCError({
				code: "CONFLICT",
				message: "Application with this 'AppName' already exists",
			}),
		);

		await expect(installGenerated()).rejects.toMatchObject({
			code: "CONFLICT",
		});
		expect(db.delete).not.toHaveBeenCalled();
	});

	it.each([
		["updateApplication", () => server.updateApplication],
		["createMount", () => server.createMount],
		["createLibreDBStudio", () => studioService.createLibreDBStudio],
		["addNewService", () => permission.addNewService],
		["createDomain", () => server.createDomain],
		["myQueue.add", () => queue.myQueue.add],
	])("removes the application again when %s fails", async (_step, step) => {
		step().mockRejectedValue(new Error("step failed"));

		await expect(installGenerated()).rejects.toThrow("step failed");

		expect(db.delete).toHaveBeenCalledWith(applications);
		expect(queue.cleanQueuesByApplication).toHaveBeenCalledWith("app-1");
		expect(server.deleteAllMiddlewares).toHaveBeenCalledWith(
			expect.objectContaining({ applicationId: "app-1" }),
		);
		expect(server.removeDeployments).toHaveBeenCalledWith(
			expect.objectContaining({ applicationId: "app-1" }),
		);
		expect(server.removeDirectoryCode).toHaveBeenCalledWith(APP_NAME, null);
		expect(server.removeMonitoringDirectory).toHaveBeenCalledWith(
			APP_NAME,
			null,
		);
		expect(server.removeTraefikConfig).toHaveBeenCalledWith(APP_NAME, null);
		expect(server.removeService).toHaveBeenCalledWith(APP_NAME, null);
		expect(audit).not.toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ action: "deploy" }),
		);
	});

	it("writes no create audit when the deploy cannot be queued", async () => {
		queue.myQueue.add.mockRejectedValue(new Error("queue down"));

		await expect(installGenerated()).rejects.toThrow("queue down");

		expect(db.delete).toHaveBeenCalledWith(applications);
		expect(audit).not.toHaveBeenCalled();
	});

	it("keeps the application, logs the failure and still deploys when the seed sync fails", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		studioService.syncLibreDBStudio.mockRejectedValue(new Error("sync failed"));

		const result = await installGenerated();

		expect(result).toEqual({
			libredbStudioId: "studio-1",
			applicationId: "app-1",
			url: `http://${GENERATED_HOST}`,
		});
		expect(db.delete).not.toHaveBeenCalled();
		expect(server.removeService).not.toHaveBeenCalled();
		expect(console.error).toHaveBeenCalledWith(
			"[libredb-studio] Seed sync failed for Studio studio-1 during the install:",
			expect.objectContaining({ message: "sync failed" }),
		);
		expect(audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ action: "create" }),
		);
		expect(queue.myQueue.add).toHaveBeenCalledWith(
			"deployments",
			expect.objectContaining({ applicationId: "app-1", type: "deploy" }),
			{ removeOnComplete: true, removeOnFail: true },
		);
		expect(audit).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ action: "deploy" }),
		);
	});

	it("keeps the install error when the cleanup fails as well", async () => {
		vi.spyOn(console, "error").mockImplementation(() => undefined);
		server.createDomain.mockRejectedValue(new Error("Traefik write failed"));
		server.findApplicationById.mockRejectedValue(new Error("database down"));

		await expect(installGenerated()).rejects.toThrow("Traefik write failed");
		expect(console.error).toHaveBeenCalledWith(
			"Failed to clean up the partly installed LibreDB Studio application app-1:",
			expect.objectContaining({ message: "database down" }),
		);
	});
});

describe("libredbStudio.byEnvironment", () => {
	beforeEach(() => {
		studioService.findLibreDBStudiosByEnvironment.mockResolvedValue([
			studioRow("studio-1", "app-1"),
			studioRow("studio-2", "app-2"),
		]);
		studioService.getLibreDBStudioView.mockImplementation(async (id) =>
			studioView(id),
		);
	});

	it("returns the view of every Studio the caller can open", async () => {
		const result = await caller().byEnvironment({ environmentId: "env-1" });

		expect(permission.checkEnvironmentAccess).toHaveBeenCalledWith(
			expect.anything(),
			"env-1",
			"read",
		);
		expect(result).toEqual([studioView("studio-1"), studioView("studio-2")]);
	});

	it("hides a Studio whose application the member cannot read", async () => {
		permission.checkServiceAccess.mockImplementation(
			async (_ctx, serviceId) => {
				if (serviceId === "app-2") {
					throw denied("You don't have access to this service");
				}
			},
		);

		const result = await caller("member").byEnvironment({
			environmentId: "env-1",
		});

		expect(result).toEqual([studioView("studio-1")]);
		expect(studioService.getLibreDBStudioView).toHaveBeenCalledTimes(1);
	});

	it("surfaces an access check that fails for another reason", async () => {
		permission.checkServiceAccess.mockRejectedValue(new Error("database down"));

		await expect(
			caller().byEnvironment({ environmentId: "env-1" }),
		).rejects.toThrow("database down");
	});

	it("requires read access to the environment", async () => {
		permission.checkEnvironmentAccess.mockRejectedValue(
			denied("You don't have access to this environment"),
		);

		await expect(
			caller("member").byEnvironment({ environmentId: "env-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(
			studioService.findLibreDBStudiosByEnvironment,
		).not.toHaveBeenCalled();
	});

	it("refuses an environment of another organization", async () => {
		server.findEnvironmentById.mockResolvedValue({
			environmentId: "env-1",
			projectId: "project-1",
			project: { projectId: "project-1", organizationId: "org-2" },
		});

		await expect(
			caller().byEnvironment({ environmentId: "env-1" }),
		).rejects.toMatchObject({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this environment",
		});
	});
});

describe("libredbStudio.byApplication", () => {
	it("returns null for an application that is not a Studio", async () => {
		studioService.findLibreDBStudioByApplicationId.mockResolvedValue(null);

		await expect(
			caller().byApplication({ applicationId: "app-9" }),
		).resolves.toBeNull();
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-9",
			"read",
		);
	});

	it("returns the view of a Studio application", async () => {
		studioService.findLibreDBStudioByApplicationId.mockResolvedValue(
			studioRow("studio-1", "app-1"),
		);
		studioService.getLibreDBStudioView.mockResolvedValue(
			studioView("studio-1"),
		);

		await expect(
			caller().byApplication({ applicationId: "app-1" }),
		).resolves.toEqual(studioView("studio-1"));
	});

	it("requires read access to the application", async () => {
		studioService.findLibreDBStudioByApplicationId.mockResolvedValue(
			studioRow("studio-1", "app-1"),
		);
		permission.checkServiceAccess.mockRejectedValue(
			denied("You don't have access to this service"),
		);

		await expect(
			caller("member").byApplication({ applicationId: "app-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		expect(studioService.getLibreDBStudioView).not.toHaveBeenCalled();
	});

	it("answers an owner asking for a Studio of another organization like for an id that does not exist", async () => {
		studioService.findLibreDBStudioByApplicationId.mockResolvedValue(null);
		const missing = await caller().byApplication({ applicationId: "app-9" });

		const row = studioRow("studio-1", "app-1");
		row.application.environment.project.organizationId = "org-2";
		studioService.findLibreDBStudioByApplicationId.mockResolvedValue(row);
		const foreign = await caller().byApplication({ applicationId: "app-1" });

		expect(missing).toBeNull();
		expect(foreign).toBeNull();
		expect(studioService.getLibreDBStudioView).not.toHaveBeenCalled();
	});
});

describe("libredbStudio.forDatabase", () => {
	const seedId = `dokploy-postgres-${createHash("sha256").update("postgres-1").digest("hex").slice(0, 12)}`;
	const database = (organizationId = "org-1") => ({
		postgresId: "postgres-1",
		environmentId: "env-1",
		serverId: null,
		applicationStatus: "done",
		environment: { projectId: "project-1", project: { organizationId } },
	});
	const forPostgres = (role = "owner") =>
		caller(role).forDatabase({
			databaseType: "postgres",
			databaseId: "postgres-1",
		});

	beforeEach(() => {
		server.findPostgresById.mockResolvedValue(database());
	});

	it("reports the Studio that covers the database", async () => {
		const view = {
			...studioView("studio-1"),
			covered: [
				{
					kind: "postgres",
					id: "postgres-1",
					name: "Orders DB",
					seedId,
					applicationStatus: "done",
				},
			],
		};
		studioService.findLibreDBStudiosByScope.mockResolvedValue([
			studioRow("studio-1", "app-1"),
		]);
		studioService.getLibreDBStudioView.mockResolvedValue(view);

		await expect(forPostgres()).resolves.toEqual({
			studio: view,
			seedId,
			covered: true,
			reason: null,
			canInstall: false,
			databaseStatus: "done",
			environmentId: "env-1",
			serverId: null,
		});
		expect(studioService.findLibreDBStudiosByScope).toHaveBeenCalledWith({
			environmentId: "env-1",
			serverId: null,
		});
	});

	it("explains why the Studio cannot reach the database", async () => {
		const message =
			"Uses a custom Swarm network override, so the Studio cannot join it automatically.";
		studioService.findLibreDBStudiosByScope.mockResolvedValue([
			studioRow("studio-1", "app-1"),
		]);
		studioService.getLibreDBStudioView.mockResolvedValue({
			...studioView("studio-1"),
			excluded: [
				{
					kind: "postgres",
					id: "postgres-1",
					name: "Orders DB",
					reason: "network-swarm-override",
					message,
				},
			],
		});

		await expect(forPostgres()).resolves.toMatchObject({
			covered: false,
			reason: message,
			canInstall: false,
		});
	});

	it("offers the install when no Studio exists and the caller may create one", async () => {
		await expect(forPostgres()).resolves.toEqual({
			studio: null,
			seedId,
			covered: false,
			reason: null,
			canInstall: true,
			databaseStatus: "done",
			environmentId: "env-1",
			serverId: null,
		});
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"project-1",
			"create",
		);
		expect(permission.checkPermission).toHaveBeenCalledWith(expect.anything(), {
			deployment: ["create"],
		});
	});

	it("does not offer the install without service.create on the project", async () => {
		permission.checkServiceAccess.mockImplementation(
			async (_ctx, serviceId, action) => {
				if (serviceId === "project-1" && action === "create") {
					throw denied("You don't have access to this project");
				}
			},
		);

		await expect(forPostgres("member")).resolves.toMatchObject({
			studio: null,
			canInstall: false,
		});
	});

	it("does not offer the install to a member without read access to the environment", async () => {
		permission.checkEnvironmentAccess.mockRejectedValue(
			denied("You don't have access to this environment"),
		);

		await expect(forPostgres("member")).resolves.toMatchObject({
			studio: null,
			canInstall: false,
		});
		expect(permission.checkEnvironmentAccess).toHaveBeenCalledWith(
			expect.anything(),
			"env-1",
			"read",
		);
	});

	it("does not offer the install on the Dokploy host when only remote servers may run services", async () => {
		server.getWebServerSettings.mockResolvedValue({ remoteServersOnly: true });

		await expect(forPostgres()).resolves.toMatchObject({ canInstall: false });
	});

	it("does not offer the install on a server the caller cannot access", async () => {
		server.findPostgresById.mockResolvedValue({
			...database(),
			serverId: "server-9",
		});

		await expect(forPostgres()).resolves.toMatchObject({
			studio: null,
			canInstall: false,
			serverId: "server-9",
		});
		expect(studioService.findLibreDBStudiosByScope).toHaveBeenCalledWith({
			environmentId: "env-1",
			serverId: "server-9",
		});
	});

	it("fails loudly when the Studio view lists the database nowhere", async () => {
		studioService.findLibreDBStudiosByScope.mockResolvedValue([
			studioRow("studio-1", "app-1"),
		]);
		studioService.getLibreDBStudioView.mockResolvedValue(
			studioView("studio-1"),
		);

		await expect(forPostgres()).rejects.toMatchObject({
			code: "INTERNAL_SERVER_ERROR",
			message:
				"The LibreDB Studio of this environment and server does not list this database",
		});
	});

	it("gives a member who can read the database but not open its Studio no Studio URL and the access sentence", async () => {
		studioService.findLibreDBStudiosByScope.mockResolvedValue([
			studioRow("studio-1", "app-1"),
		]);
		studioService.getLibreDBStudioView.mockResolvedValue(
			studioView("studio-1"),
		);
		permission.checkServiceAccess.mockImplementation(
			async (_ctx, serviceId) => {
				if (serviceId === "app-1") {
					throw denied("You don't have access to this service");
				}
			},
		);

		const result = await forPostgres("member");

		expect(result).toEqual({
			studio: null,
			seedId,
			covered: false,
			reason:
				"A LibreDB Studio manages this database, but you do not have access to it.",
			canInstall: false,
			databaseStatus: "done",
			environmentId: "env-1",
			serverId: null,
		});
		expect(JSON.stringify(result)).not.toContain(GENERATED_HOST);
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"postgres-1",
			"read",
		);
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			expect.anything(),
			"app-1",
			"read",
		);
		expect(studioService.getLibreDBStudioView).not.toHaveBeenCalled();
	});

	it.each([
		["mysql", () => server.findMySqlById],
		["mariadb", () => server.findMariadbById],
		["mongo", () => server.findMongoById],
		["redis", () => server.findRedisById],
		["libsql", () => server.findLibsqlById],
	] as const)(
		"loads a %s database with its own finder",
		async (kind, finder) => {
			finder().mockResolvedValue(database());

			const result = await caller().forDatabase({
				databaseType: kind,
				databaseId: "db-1",
			});

			expect(finder()).toHaveBeenCalledWith("db-1");
			expect(result.seedId).toBe(
				`dokploy-${kind}-${createHash("sha256").update("db-1").digest("hex").slice(0, 12)}`,
			);
		},
	);

	it("requires read access to the database", async () => {
		permission.checkServiceAccess.mockRejectedValue(
			denied("You don't have access to this service"),
		);

		await expect(forPostgres("member")).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
		expect(studioService.findLibreDBStudiosByScope).not.toHaveBeenCalled();
	});

	it("answers an owner asking for a database of another organization like for an id that does not exist", async () => {
		server.findPostgresById.mockRejectedValue(
			new TRPCError({ code: "NOT_FOUND", message: "Postgres not found" }),
		);
		const missing = await forPostgres().then(
			() => null,
			(error: TRPCError) => error,
		);

		server.findPostgresById.mockResolvedValue(database("org-2"));
		const foreign = await forPostgres().then(
			() => null,
			(error: TRPCError) => error,
		);

		expect(missing).toBeInstanceOf(TRPCError);
		expect(foreign).toBeInstanceOf(TRPCError);
		expect({ code: foreign?.code, message: foreign?.message }).toEqual({
			code: missing?.code,
			message: missing?.message,
		});
		expect(foreign).toMatchObject({ code: "NOT_FOUND" });
		expect(permission.checkServiceAccess).not.toHaveBeenCalled();
		expect(studioService.findLibreDBStudiosByScope).not.toHaveBeenCalled();
	});

	it("surfaces a database lookup that fails for another reason", async () => {
		server.findPostgresById.mockRejectedValue(new Error("database down"));

		await expect(forPostgres()).rejects.toThrow("database down");
	});
});

describe("libredbStudio read queries and the Studio secrets", () => {
	it.each([
		["byEnvironment", () => caller().byEnvironment({ environmentId: "env-1" })],
		["byApplication", () => caller().byApplication({ applicationId: "app-1" })],
		[
			"forDatabase",
			() =>
				caller().forDatabase({
					databaseType: "postgres",
					databaseId: "postgres-1",
				}),
		],
	])(
		"%s returns none of the secrets of the libredb_studio row",
		async (_name, call) => {
			const row = studioRow("studio-1", "app-1");
			studioService.findLibreDBStudiosByEnvironment.mockResolvedValue([row]);
			studioService.findLibreDBStudioByApplicationId.mockResolvedValue(row);
			studioService.findLibreDBStudiosByScope.mockResolvedValue([row]);
			studioService.getLibreDBStudioView.mockResolvedValue({
				...studioView("studio-1"),
				covered: [
					{
						kind: "postgres",
						id: "postgres-1",
						name: "Orders DB",
						seedId: "dokploy-postgres-1a2b3c4d5e6f",
						applicationStatus: "done",
					},
				],
			});
			server.findPostgresById.mockResolvedValue({
				postgresId: "postgres-1",
				environmentId: "env-1",
				serverId: null,
				applicationStatus: "done",
				environment: {
					projectId: "project-1",
					project: { organizationId: "org-1" },
				},
			});

			const result = JSON.stringify(await call());

			expect(result).toContain("studio-1");
			for (const secret of Object.values(STUDIO_SECRETS)) {
				expect(result).not.toContain(secret);
			}
		},
	);
});
