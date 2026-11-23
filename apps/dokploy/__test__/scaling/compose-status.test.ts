import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type ComposeSnapshot,
	readComposeSnapshot,
} from "@dokploy/server/services/scaling/compose-snapshot";
import {
	classifyContainer,
	type containerToReplica,
	getComposeScalingStatus,
	type ScalableCompose,
} from "@dokploy/server/services/scaling/compose-status";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

type ContainerInfo = Parameters<typeof containerToReplica>[0];

const { getRemoteDockerMock } = vi.hoisted(() => ({
	getRemoteDockerMock: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock(
	"@dokploy/server/services/scaling/compose-snapshot",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-snapshot")
		>()),
		readComposeSnapshot: vi.fn(),
	}),
);

const compose = (
	overrides: Partial<ScalableCompose> = {},
): ScalableCompose => ({
	composeId: "compose-1",
	appName: "shop",
	serverId: null,
	sourceType: "github",
	composePath: "docker-compose.yml",
	composeType: "docker-compose",
	createEnvFile: true,
	command: "",
	composeStatus: "done",
	server: null,
	...overrides,
});

const snapshotOf = (
	yaml: string,
	composeType: "docker-compose" | "stack",
): ComposeSnapshot => ({
	spec: parse(yaml),
	composeType,
	projectDirectory: "/code",
	files: {
		dir: "/snap",
		compose: "/snap/compose.yml",
		env: "/snap/compose.env",
	},
});

const container = (
	service: string,
	number: number,
	state: string,
	status: string,
): ContainerInfo =>
	({
		Id: `${service}-${number}`,
		State: state,
		Status: status,
		Created: 1_700_000_000,
		Labels: {
			"com.docker.compose.project": "shop",
			"com.docker.compose.service": service,
			"com.docker.compose.container-number": String(number),
		},
	}) as unknown as ContainerInfo;

describe("classifyContainer", () => {
	it.each([
		["running", "Up 3 minutes", "ready"],
		["running", "Up 3 minutes (healthy)", "ready"],
		["running", "Up 5 seconds (health: starting)", "starting"],
		["running", "Up 2 minutes (unhealthy)", "failed"],
		["created", "Created", "starting"],
		["restarting", "Restarting (1) 2 seconds ago", "failed"],
		["exited", "Exited (0) 1 minute ago", "stopped"],
		["exited", "Exited (137) 1 minute ago", "failed"],
		["dead", "Dead", "failed"],
		["removing", "Removal In Progress", "stopping"],
		["paused", "Up 1 minute (Paused)", "stopped"],
	])("%s / %s → %s", (State, Status, phase) => {
		expect(classifyContainer({ State, Status })).toBe(phase);
	});
});

describe("getComposeScalingStatus", () => {
	const docker = {
		listContainers: vi.fn(),
		listServices: vi.fn(),
		listTasks: vi.fn(),
		listNodes: vi.fn(),
	};

	beforeEach(() => {
		for (const fn of Object.values(docker)) fn.mockReset();
		getRemoteDockerMock.mockResolvedValue(docker);
		vi.mocked(readComposeSnapshot).mockReset();
		vi.mocked(db.query.composeServiceScaling.findMany).mockResolvedValue([]);
	});

	it("groups plain compose containers by service", async () => {
		vi.mocked(readComposeSnapshot).mockResolvedValue(
			snapshotOf(
				`
services:
  web:
    image: nginx
    deploy: { replicas: 3 }
    healthcheck: { test: ["CMD", "true"] }
  db:
    image: postgres
    container_name: shop-db
`,
				"docker-compose",
			),
		);
		docker.listContainers.mockResolvedValue([
			container("web", 2, "running", "Up 1 minute (health: starting)"),
			container("web", 1, "running", "Up 9 minutes (healthy)"),
			container("web", 3, "running", "Up 9 minutes (healthy)"),
			container("db", 1, "running", "Up 9 minutes"),
			{
				...container("web", 0, "exited", "Exited (0)"),
				Labels: {
					"com.docker.compose.project": "shop",
					"com.docker.compose.service": "web",
					"com.docker.compose.oneoff": "True",
				},
			},
		]);

		const status = await getComposeScalingStatus(compose());

		expect(status.snapshot).toBe(true);
		const [db, web] = status.services;
		expect(web).toMatchObject({
			serviceName: "web",
			deployed: true,
			desired: 3,
			configured: 3,
			inSync: true,
			healthCheck: true,
			counts: { ready: 2, starting: 1 },
		});
		expect(web?.replicas.map((replica) => replica.slot)).toEqual([1, 2, 3]);
		expect(db?.singleInstanceReasons[0]).toMatch(/container_name/);
		expect(db?.healthCheck).toBe(false);
	});

	it("reports a saved count the file cannot express", async () => {
		vi.mocked(readComposeSnapshot).mockResolvedValue(
			snapshotOf(
				"services:\n  db:\n    image: postgres\n    container_name: db\n",
				"docker-compose",
			),
		);
		vi.mocked(db.query.composeServiceScaling.findMany).mockResolvedValue([
			{ serviceName: "db", replicas: 2 },
		] as never);
		docker.listContainers.mockResolvedValue([
			container("db", 1, "running", "Up"),
		]);

		const [service] = (await getComposeScalingStatus(compose())).services;

		expect(service?.configured).toBe(2);
		expect(service?.overridden).toBe(true);
		expect(service?.overrideNotApplied).toMatch(/not used/);
	});

	it("disables scaling while a deploy runs or with a custom command", async () => {
		vi.mocked(readComposeSnapshot).mockResolvedValue(null);
		docker.listContainers.mockResolvedValue([
			container("web", 1, "running", "Up"),
		]);

		const deploying = await getComposeScalingStatus(
			compose({ composeStatus: "running" }),
		);
		expect(deploying.services[0]?.disabledReason).toMatch(/deployment/);

		const custom = await getComposeScalingStatus(
			compose({ command: "compose -f other.yml up -d" }),
		);
		expect(custom.customCommand).toBe(true);
		expect(custom.services[0]?.disabledReason).toMatch(/custom command/);
	});

	it("reads stack services from Swarm", async () => {
		vi.mocked(readComposeSnapshot).mockResolvedValue(
			snapshotOf(
				`
services:
  api: { image: api }
  agent:
    image: agent
    deploy: { mode: global }
  queued: { image: q }
`,
				"stack",
			),
		);
		docker.listServices.mockResolvedValue([
			{
				ID: "svc-api",
				Spec: { Name: "shop_api", Mode: { Replicated: { Replicas: 2 } } },
			},
			{
				ID: "svc-agent",
				Spec: { Name: "shop_agent", Mode: { Global: {} } },
			},
			{
				ID: "svc-other",
				Spec: { Name: "other_api", Mode: { Replicated: { Replicas: 1 } } },
			},
		]);
		docker.listTasks.mockResolvedValue([
			{
				ID: "t1",
				ServiceID: "svc-api",
				Slot: 1,
				NodeID: "n1",
				DesiredState: "running",
				Status: { State: "running", Timestamp: new Date().toISOString() },
			},
			{
				ID: "t2",
				ServiceID: "svc-api",
				Slot: 2,
				NodeID: "n2",
				DesiredState: "running",
				Status: { State: "starting", Timestamp: new Date().toISOString() },
			},
		]);
		docker.listNodes.mockResolvedValue([
			{ ID: "n1", Description: { Hostname: "vm-1" } },
			{ ID: "n2", Description: { Hostname: "vm-2" } },
		]);

		const status = await getComposeScalingStatus(
			compose({ composeType: "stack" }),
		);

		expect(docker.listServices).toHaveBeenCalledWith({
			filters: JSON.stringify({
				label: ["com.docker.stack.namespace=shop"],
			}),
		});
		const byName = Object.fromEntries(
			status.services.map((service) => [service.serviceName, service]),
		);
		expect(Object.keys(byName)).toEqual(["agent", "api", "queued"]);
		expect(byName.api).toMatchObject({
			desired: 2,
			counts: { ready: 1, starting: 1 },
			disabledReason: null,
		});
		expect(byName.api?.distribution.map((entry) => entry.hostname)).toEqual([
			"vm-1",
			"vm-2",
		]);
		expect(byName.agent?.disabledReason).toMatch(/global mode/);
		expect(byName.queued).toMatchObject({ deployed: false, configured: 1 });
	});

	describe("before the first deploy", () => {
		beforeEach(() => {
			vi.mocked(readComposeSnapshot).mockResolvedValue(null);
			docker.listContainers.mockResolvedValue([]);
			docker.listServices.mockResolvedValue([]);
			docker.listNodes.mockResolvedValue([]);
		});

		it("lists the services of a raw compose file and what limits them", async () => {
			const status = await getComposeScalingStatus(
				compose({
					composeStatus: "idle",
					sourceType: "raw",
					composeFile: `
services:
  nginx:
    image: nginx:latest
    container_name: basic_nginx
    ports: ["80:80"]
  web:
    image: nginx
    deploy: { replicas: 4 }
`,
				}),
			);

			expect(status.snapshot).toBe(false);
			const [nginx, web] = status.services;
			expect(nginx).toMatchObject({
				serviceName: "nginx",
				deployed: false,
				configured: 1,
				desired: null,
			});
			expect(nginx?.singleInstanceReasons).toHaveLength(2);
			expect(web).toMatchObject({ serviceName: "web", configured: 4 });
		});

		it("reads a cloned compose file and applies the randomize suffix", async () => {
			const target = compose({
				appName: `status-source-${process.pid}`,
				composeType: "stack",
				composePath: "deploy/compose.yml",
				composeStatus: "idle",
				randomize: true,
				suffix: "abc",
			});
			const { COMPOSE_PATH } = paths(false);
			const dir = join(COMPOSE_PATH, target.appName, "code", "deploy");
			mkdirSync(dir, { recursive: true });
			writeFileSync(
				join(dir, "compose.yml"),
				"services:\n  api:\n    image: a\n",
			);
			try {
				const status = await getComposeScalingStatus(target);
				expect(status.services.map((service) => service.serviceName)).toEqual([
					"api-abc",
				]);
			} finally {
				rmSync(join(COMPOSE_PATH, target.appName), {
					recursive: true,
					force: true,
				});
			}
		});

		it("lists nothing when the source cannot be read", async () => {
			const status = await getComposeScalingStatus(
				compose({ sourceType: "raw", composeFile: "services: [" }),
			);
			expect(status.services).toEqual([]);
		});
	});
});
