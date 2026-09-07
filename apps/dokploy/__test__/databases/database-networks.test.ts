import { buildLibSql } from "@dokploy/server/utils/databases/libsql";
import { buildMariaDB } from "@dokploy/server/utils/databases/mariadb";
import { buildMongo } from "@dokploy/server/utils/databases/mongo";
import { buildMysql } from "@dokploy/server/utils/databases/mysql";
import { buildPostgres } from "@dokploy/server/utils/databases/postgres";
import { buildRedis } from "@dokploy/server/utils/databases/redis";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
	inspectMock,
	updateMock,
	getServiceMock,
	createServiceMock,
	getRemoteDockerMock,
	resolveServiceNetworksMock,
} = vi.hoisted(() => {
	const inspect = vi.fn();
	const update = vi.fn();
	const getService = vi.fn(() => ({ inspect, update }));
	const createService = vi.fn(async () => undefined);
	const getRemoteDocker = vi.fn(async () => ({
		getService,
		createService,
	}));
	const resolveServiceNetworks = vi.fn(async () => [
		{ Target: "dokploy-network" },
		{ Target: "custom-overlay" },
	]);
	return {
		inspectMock: inspect,
		updateMock: update,
		getServiceMock: getService,
		createServiceMock: createService,
		getRemoteDockerMock: getRemoteDocker,
		resolveServiceNetworksMock: resolveServiceNetworks,
	};
});

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock("@dokploy/server/services/network", () => ({
	resolveServiceNetworks: resolveServiceNetworksMock,
}));

vi.mock("@dokploy/server/utils/vault", () => ({
	withResolvedVaultRefs: vi.fn(async (arg) => arg),
}));

const createBaseDb = (appName: string) => ({
	appName,
	databaseName: "testdb",
	databaseUser: "testuser",
	databasePassword: "testpassword",
	dockerImage: "postgres:16",
	externalPort: 5432,
	memoryLimit: null,
	memoryReservation: null,
	cpuLimit: null,
	cpuReservation: null,
	command: null,
	args: null,
	mounts: [],
	environment: {
		project: { env: null },
		env: null,
	},
	serverId: null,
	networkIds: ["custom-overlay-id"],
	detachDokployNetwork: false,
});

describe("database networks configuration", () => {
	beforeEach(() => {
		inspectMock.mockReset();
		updateMock.mockReset();
		getServiceMock.mockClear();
		createServiceMock.mockClear();
		getRemoteDockerMock.mockClear();
		getRemoteDockerMock.mockResolvedValue({
			getService: getServiceMock,
			createService: createServiceMock,
		});
		getServiceMock.mockReturnValue({
			inspect: inspectMock,
			update: updateMock,
		});
	});

	describe("buildPostgres", () => {
		it("attaches networks at both root and TaskTemplate when creating service", async () => {
			inspectMock.mockRejectedValue(new Error("service not found"));
			const db = createBaseDb("postgres-test-1");

			await buildPostgres(db as any);

			expect(createServiceMock).toHaveBeenCalledTimes(1);
			const [settings] = createServiceMock.mock.calls[0] as [any];
			expect(settings.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(settings.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
		});

		it("preserves root and TaskTemplate networks when updating service", async () => {
			inspectMock.mockResolvedValue({
				Version: { Index: "42" },
				Spec: {
					TaskTemplate: { ForceUpdate: 1 },
				},
			});
			const db = createBaseDb("postgres-test-2");

			await buildPostgres(db as any);

			expect(updateMock).toHaveBeenCalledTimes(1);
			const [updatePayload] = updateMock.mock.calls[0] as [any];
			expect(updatePayload.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.ForceUpdate).toBe(2);
		});
	});

	describe("buildMysql", () => {
		it("attaches networks at both root and TaskTemplate when creating and updating service", async () => {
			inspectMock.mockResolvedValue({
				Version: { Index: "10" },
				Spec: {
					TaskTemplate: { ForceUpdate: 0 },
				},
			});
			const db = createBaseDb("mysql-test-1");

			await buildMysql(db as any);

			expect(updateMock).toHaveBeenCalledTimes(1);
			const [updatePayload] = updateMock.mock.calls[0] as [any];
			expect(updatePayload.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
		});
	});

	describe("buildMariaDB", () => {
		it("attaches networks at both root and TaskTemplate when creating and updating service", async () => {
			inspectMock.mockResolvedValue({
				Version: { Index: "15" },
				Spec: {
					TaskTemplate: { ForceUpdate: 3 },
				},
			});
			const db = createBaseDb("mariadb-test-1");

			await buildMariaDB(db as any);

			expect(updateMock).toHaveBeenCalledTimes(1);
			const [updatePayload] = updateMock.mock.calls[0] as [any];
			expect(updatePayload.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
		});
	});

	describe("buildRedis", () => {
		it("attaches networks at both root and TaskTemplate when creating and updating service", async () => {
			inspectMock.mockResolvedValue({
				Version: { Index: "20" },
				Spec: {
					TaskTemplate: { ForceUpdate: 5 },
				},
			});
			const db = createBaseDb("redis-test-1");

			await buildRedis(db as any);

			expect(updateMock).toHaveBeenCalledTimes(1);
			const [updatePayload] = updateMock.mock.calls[0] as [any];
			expect(updatePayload.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
		});
	});

	describe("buildMongo", () => {
		it("attaches networks at both root and TaskTemplate when creating and updating service", async () => {
			inspectMock.mockResolvedValue({
				Version: { Index: "25" },
				Spec: {
					TaskTemplate: { ForceUpdate: 2 },
				},
			});
			const db = createBaseDb("mongo-test-1");

			await buildMongo(db as any);

			expect(updateMock).toHaveBeenCalledTimes(1);
			const [updatePayload] = updateMock.mock.calls[0] as [any];
			expect(updatePayload.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
		});
	});

	describe("buildLibSql", () => {
		it("attaches networks at both root and TaskTemplate when creating and updating service", async () => {
			inspectMock.mockResolvedValue({
				Version: { Index: "30" },
				Spec: {
					TaskTemplate: { ForceUpdate: 1 },
				},
			});
			const db = createBaseDb("libsql-test-1");

			await buildLibSql(db as any);

			expect(updateMock).toHaveBeenCalledTimes(1);
			const [updatePayload] = updateMock.mock.calls[0] as [any];
			expect(updatePayload.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
			expect(updatePayload.TaskTemplate.Networks).toEqual([
				{ Target: "dokploy-network" },
				{ Target: "custom-overlay" },
			]);
		});
	});
});
