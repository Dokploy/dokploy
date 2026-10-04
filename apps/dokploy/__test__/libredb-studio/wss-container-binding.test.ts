import { beforeEach, describe, expect, it, vi } from "vitest";

const permission = vi.hoisted(() => ({
	checkServiceAccess: vi.fn(),
	findMemberByUserId: vi.fn(),
	hasPermission: vi.fn(),
}));
vi.mock("@dokploy/server/services/permission", () => permission);

type Row = { appName: string; serverId: string | null; composeType?: string };
const rows = vi.hoisted(() => ({}) as Record<string, Row | undefined>);
const table = (name: string) => ({
	findFirst: vi.fn(() => Promise.resolve(rows[name])),
});
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			applications: table("applications"),
			compose: table("compose"),
			postgres: table("postgres"),
			mysql: table("mysql"),
			mariadb: table("mariadb"),
			mongo: table("mongo"),
			redis: table("redis"),
			libsql: table("libsql"),
		},
	},
}));

const notFound = () =>
	Object.assign(new Error("no such object"), { statusCode: 404 });
const docker = vi.hoisted(() => ({
	containers: {} as Record<string, Record<string, string>>,
	tasks: {} as Record<string, string>,
	services: {} as Record<
		string,
		{ Name: string; Labels?: Record<string, string> }
	>,
}));
const fakeDocker = {
	getContainer: (id: string) => ({
		inspect: async () => {
			const labels = docker.containers[id];
			if (!labels) throw notFound();
			return { Config: { Labels: labels } };
		},
	}),
	// Like the daemon, a task resolves by its full ID or a unique ID prefix.
	getTask: (id: string) => ({
		inspect: async () => {
			const matches = Object.keys(docker.tasks).filter((taskId) =>
				taskId.startsWith(id),
			);
			const taskId = docker.tasks[id] ? id : matches[0];
			if (!taskId || (!docker.tasks[id] && matches.length !== 1)) {
				throw notFound();
			}
			return { ID: taskId, ServiceID: docker.tasks[taskId] };
		},
	}),
	getService: (id: string) => ({
		inspect: async () => {
			const spec = docker.services[id];
			if (!spec) throw notFound();
			return { Spec: spec };
		},
	}),
};

const server = vi.hoisted(() => ({
	getAccessibleServerIds: vi.fn(),
	getRemoteDocker: vi.fn(),
}));
vi.mock("@dokploy/server", () => server);

const { canAccessDockerOverWss } = await import("@/server/wss/authorize");

const USER = { id: "user-1" };
const SESSION = { activeOrganizationId: "org-1" };
const APP = "shop-api-abc123";
const OTHER = "shop-db-def456";

const swarmContainer = (appName: string) => ({
	"com.docker.swarm.service.name": appName,
	"com.docker.swarm.task.name": `${appName}.1.task`,
});

const terminal = (containerId: string) =>
	({ type: "terminal", containerId }) as const;
const nativeLogs = (containerId: string) =>
	({ type: "logs", containerId, runType: "native" }) as const;
const swarmLogs = (containerId: string) =>
	({ type: "logs", containerId, runType: "swarm" }) as const;
const stats = (
	appName: string,
	appType: "application" | "stack" | "docker-compose" = "application",
) => ({ type: "stats", appName, appType }) as const;

beforeEach(() => {
	vi.clearAllMocks();
	for (const key of Object.keys(rows)) delete rows[key];
	docker.containers = {
		"own-container": swarmContainer(APP),
		"other-container": swarmContainer(OTHER),
	};
	docker.tasks = { "own-task": "svc-own", "other-task": "svc-other" };
	docker.services = {
		"svc-own": { Name: APP },
		"svc-other": { Name: OTHER },
	};
	rows.applications = { appName: APP, serverId: null };
	permission.checkServiceAccess.mockResolvedValue(undefined);
	permission.findMemberByUserId.mockResolvedValue({ role: "member" });
	server.getRemoteDocker.mockResolvedValue(fakeDocker);
});

describe("canAccessDockerOverWss binds the container to the service", () => {
	it.each([
		["terminal", terminal("own-container")],
		["native logs", nativeLogs("own-container")],
		["swarm logs", swarmLogs("own-task")],
		["stats", stats(APP)],
	])("allows the %s of a container of the service", async (_name, target) => {
		await expect(
			canAccessDockerOverWss(USER, SESSION, null, "app-1", target),
		).resolves.toBe(true);
		expect(permission.checkServiceAccess).toHaveBeenCalledWith(
			{ user: USER, session: SESSION },
			"app-1",
			"read",
		);
	});

	it.each([
		["terminal", terminal("other-container")],
		["native logs", nativeLogs("other-container")],
		["swarm logs", swarmLogs("other-task")],
		["stats", stats(OTHER)],
	])(
		"refuses the %s of a container of another service",
		async (_name, target) => {
			await expect(
				canAccessDockerOverWss(USER, SESSION, null, "app-1", target),
			).resolves.toBe(false);
		},
	);

	it.each([
		["terminal", terminal("missing")],
		["native logs", nativeLogs("missing")],
		["swarm logs", swarmLogs("missing")],
	])(
		"refuses the %s of a container that does not exist",
		async (_name, target) => {
			await expect(
				canAccessDockerOverWss(USER, SESSION, null, "app-1", target),
			).resolves.toBe(false);
		},
	);

	it("refuses a swarm logs request that names a service instead of a task", async () => {
		await expect(
			canAccessDockerOverWss(USER, SESSION, null, "app-1", swarmLogs(OTHER)),
		).resolves.toBe(false);
	});

	it.each([
		["a prefix of its own task", "own-t"],
		["a prefix that is also another service's ID", "svc-other"],
	])(
		"refuses swarm logs for %s, which docker service logs may resolve as a service",
		async (_name, prefix) => {
			docker.tasks = { "own-task": "svc-own", "svc-other-task": "svc-own" };
			await expect(
				canAccessDockerOverWss(USER, SESSION, null, "app-1", swarmLogs(prefix)),
			).resolves.toBe(false);
		},
	);

	it("refuses a request without a target", async () => {
		await expect(
			canAccessDockerOverWss(USER, SESSION, null, "app-1"),
		).resolves.toBe(false);
	});

	it("refuses a service that does not exist", async () => {
		delete rows.applications;
		await expect(
			canAccessDockerOverWss(
				USER,
				SESSION,
				null,
				"app-1",
				terminal("own-container"),
			),
		).resolves.toBe(false);
	});

	it("refuses a caller without access to the service before inspecting Docker", async () => {
		permission.checkServiceAccess.mockRejectedValue(new Error("no access"));
		await expect(
			canAccessDockerOverWss(
				USER,
				SESSION,
				null,
				"app-1",
				terminal("own-container"),
			),
		).resolves.toBe(false);
		expect(server.getRemoteDocker).not.toHaveBeenCalled();
	});

	it("binds a database container by its swarm service name", async () => {
		delete rows.applications;
		rows.postgres = { appName: APP, serverId: null };
		await expect(
			canAccessDockerOverWss(
				USER,
				SESSION,
				null,
				"pg-1",
				terminal("own-container"),
			),
		).resolves.toBe(true);
		await expect(
			canAccessDockerOverWss(
				USER,
				SESSION,
				null,
				"pg-1",
				terminal("other-container"),
			),
		).resolves.toBe(false);
	});

	it("binds a docker compose container by its compose project", async () => {
		delete rows.applications;
		rows.compose = {
			appName: APP,
			serverId: null,
			composeType: "docker-compose",
		};
		docker.containers["compose-web"] = {
			"com.docker.compose.project": APP,
			"com.docker.compose.service": "web",
		};
		docker.containers["foreign-compose"] = {
			"com.docker.compose.project": OTHER,
		};
		const allowed = (target: Parameters<typeof canAccessDockerOverWss>[4]) =>
			canAccessDockerOverWss(USER, SESSION, null, "compose-1", target);

		await expect(allowed(terminal("compose-web"))).resolves.toBe(true);
		await expect(allowed(nativeLogs("compose-web"))).resolves.toBe(true);
		await expect(allowed(stats(APP, "docker-compose"))).resolves.toBe(true);
		await expect(allowed(terminal("foreign-compose"))).resolves.toBe(false);
		await expect(allowed(terminal("own-container"))).resolves.toBe(false);
		await expect(allowed(stats(OTHER, "docker-compose"))).resolves.toBe(false);
	});

	it("binds a stack container by its stack namespace", async () => {
		delete rows.applications;
		rows.compose = { appName: APP, serverId: null, composeType: "stack" };
		docker.containers["stack-web"] = {
			"com.docker.stack.namespace": APP,
			"com.docker.swarm.service.name": `${APP}_web`,
		};
		docker.tasks["stack-task"] = "svc-stack";
		docker.services["svc-stack"] = {
			Name: `${APP}_web`,
			Labels: { "com.docker.stack.namespace": APP },
		};
		const allowed = (target: Parameters<typeof canAccessDockerOverWss>[4]) =>
			canAccessDockerOverWss(USER, SESSION, null, "compose-1", target);

		await expect(allowed(terminal("stack-web"))).resolves.toBe(true);
		await expect(allowed(swarmLogs("stack-task"))).resolves.toBe(true);
		await expect(allowed(stats(`${APP}_web.1.task`, "stack"))).resolves.toBe(
			true,
		);
		await expect(allowed(swarmLogs("other-task"))).resolves.toBe(false);
		await expect(allowed(terminal("other-container"))).resolves.toBe(false);
		await expect(allowed(stats(`${OTHER}_web.1.task`, "stack"))).resolves.toBe(
			false,
		);
	});

	it("inspects the container on the remote server of the service", async () => {
		rows.applications = { appName: APP, serverId: "srv-1" };
		await expect(
			canAccessDockerOverWss(
				USER,
				SESSION,
				"srv-1",
				"app-1",
				terminal("own-container"),
			),
		).resolves.toBe(true);
		expect(server.getRemoteDocker).toHaveBeenCalledWith("srv-1");
	});

	it.each([
		["another server than the service's", "srv-2", "srv-1"],
		["the local Docker for a remote service", null, "srv-1"],
		["a remote server for a local service", "srv-1", null],
	])(
		"refuses a request that points at %s",
		async (_name, requestServerId, serviceServerId) => {
			rows.applications = { appName: APP, serverId: serviceServerId };
			await expect(
				canAccessDockerOverWss(
					USER,
					SESSION,
					requestServerId,
					"app-1",
					terminal("own-container"),
				),
			).resolves.toBe(false);
		},
	);
});

describe("canAccessDockerOverWss without a service", () => {
	it("keeps the docker permission and server access checks", async () => {
		permission.hasPermission.mockResolvedValue(true);
		server.getAccessibleServerIds.mockResolvedValue(new Set(["srv-1"]));

		await expect(
			canAccessDockerOverWss(USER, SESSION, "srv-1", null, terminal("any")),
		).resolves.toBe(true);
		await expect(
			canAccessDockerOverWss(USER, SESSION, "srv-2", null, terminal("any")),
		).resolves.toBe(false);
		permission.hasPermission.mockResolvedValue(false);
		await expect(
			canAccessDockerOverWss(USER, SESSION, null, null, stats("any")),
		).resolves.toBe(false);
		expect(server.getRemoteDocker).not.toHaveBeenCalled();
		expect(permission.checkServiceAccess).not.toHaveBeenCalled();
	});
});
