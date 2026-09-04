import type { MariadbNested } from "@dokploy/server/utils/databases/mariadb";
import { buildMariadb } from "@dokploy/server/utils/databases/mariadb";
import type { MongoNested } from "@dokploy/server/utils/databases/mongo";
import { buildMongo } from "@dokploy/server/utils/databases/mongo";
import type { MysqlNested } from "@dokploy/server/utils/databases/mysql";
import { buildMysql } from "@dokploy/server/utils/databases/mysql";
import type { PostgresNested } from "@dokploy/server/utils/databases/postgres";
import { buildPostgres } from "@dokploy/server/utils/databases/postgres";
import type { RedisNested } from "@dokploy/server/utils/databases/redis";
import { buildRedis } from "@dokploy/server/utils/databases/redis";
import { beforeEach, describe, expect, it, vi } from "vitest";

type MockSettings = {
	EndpointSpec?: {
		Mode?: string;
		Ports?: Array<Record<string, unknown>>;
	} | null;
	[key: string]: unknown;
};

const { inspectMock, getServiceMock, createServiceMock, getRemoteDockerMock } =
	vi.hoisted(() => {
		const inspect = vi.fn<() => Promise<never>>();
		const getService = vi.fn(() => ({ inspect }));
		const createService = vi.fn<(opts: MockSettings) => Promise<void>>(
			async () => undefined,
		);
		const getRemoteDocker = vi.fn(async () => ({
			getService,
			createService,
		}));
		return {
			inspectMock: inspect,
			getServiceMock: getService,
			createServiceMock: createService,
			getRemoteDockerMock: getRemoteDocker,
		};
	});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

const baseFixture = {
	appName: "test-db",
	env: null,
	dockerImage: "image:latest",
	memoryLimit: null,
	memoryReservation: null,
	cpuLimit: null,
	cpuReservation: null,
	command: null,
	args: null,
	mounts: [],
	databaseName: "db",
	databaseUser: "user",
	databasePassword: "pass",
	databaseRootPassword: "rootpass",
	externalPort: null as number | null,
	serverId: "server-id",
	environment: {
		project: { env: null },
		env: null,
	},
	updateConfigSwarm: null,
	endpointSpecSwarm: null,
	networkIds: [],
	detachDokployNetwork: false,
};

type Case = {
	name: string;
	build: (input: unknown) => Promise<unknown>;
	targetPort: number;
	extras?: Record<string, unknown>;
};

const cases: Case[] = [
	{
		name: "mariadb",
		build: (x) => buildMariadb(x as MariadbNested),
		targetPort: 3306,
	},
	{
		name: "mysql",
		build: (x) => buildMysql(x as MysqlNested),
		targetPort: 3306,
	},
	{
		name: "postgres",
		build: (x) => buildPostgres(x as PostgresNested),
		targetPort: 5432,
	},
	{
		name: "mongo",
		build: (x) => buildMongo(x as MongoNested),
		targetPort: 27017,
		extras: { replicaSets: false },
	},
	{
		name: "redis",
		build: (x) => buildRedis(x as RedisNested),
		targetPort: 6379,
	},
];

beforeEach(() => {
	inspectMock.mockReset();
	inspectMock.mockImplementation(() => {
		throw new Error("service not found");
	});
	getServiceMock.mockClear();
	createServiceMock.mockClear();
	getRemoteDockerMock.mockClear();
	getRemoteDockerMock.mockResolvedValue({
		getService: getServiceMock,
		createService: createServiceMock,
	});
});

const lastSettings = (): MockSettings => {
	const call = createServiceMock.mock.calls[0] as [MockSettings] | undefined;
	if (!call) throw new Error("createService was not called");
	return call[0];
};

describe.each(cases)(
	"build $name EndpointSpec.Ports (G13/G16)",
	({ name, build, targetPort, extras }) => {
		it("G13: externalPort null deploys with empty Ports (no host-published port = not internet-reachable)", async () => {
			await build({ ...baseFixture, ...extras, externalPort: null });

			expect(createServiceMock).toHaveBeenCalledTimes(1);
			expect(lastSettings().EndpointSpec?.Ports).toEqual([]);
		});

		it("G16: externalPort set deploys with a single host-published port", async () => {
			await build({ ...baseFixture, ...extras, externalPort: 13306 });

			expect(createServiceMock).toHaveBeenCalledTimes(1);
			const ports = lastSettings().EndpointSpec?.Ports;
			expect(ports).toEqual([
				{
					Protocol: "tcp",
					TargetPort: targetPort,
					PublishedPort: 13306,
					PublishMode: "host",
				},
			]);
		});

		it("G13b: externalPort 0 (falsy) deploys with empty Ports", async () => {
			await build({ ...baseFixture, ...extras, externalPort: 0 });

			expect(lastSettings().EndpointSpec?.Ports).toEqual([]);
			expect(lastSettings().EndpointSpec?.Mode).toBe("dnsrr");
		});

		it("sanity: target port matches the expected $name default", async () => {
			await build({ ...baseFixture, ...extras, externalPort: 13306 });
			expect(lastSettings().EndpointSpec?.Ports?.[0]?.TargetPort).toBe(
				targetPort,
			);
			if (name === "redis") {
				expect(true).toBe(true);
			}
		});
	},
);
