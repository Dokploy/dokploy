import {
	reconnectServicesToTraefik,
	recoverTraefik,
} from "@dokploy/server/services/settings";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findMany: vi.fn(),
	getRemoteDocker: vi.fn(),
	ensureTraefikRunning: vi.fn(),
}));
vi.mock("@dokploy/server/db", () => ({
	db: { query: { compose: { findMany: mocks.findMany } } },
}));
vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: mocks.getRemoteDocker,
}));
vi.mock("@dokploy/server/setup/traefik-setup", () => ({
	ensureTraefikRunning: mocks.ensureTraefikRunning,
}));

const connect = vi.fn();
const inspectNetwork = vi.fn();
const inspectContainer = vi.fn();
describe("reconnectServicesToTraefik", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.findMany.mockResolvedValue([]);
		mocks.getRemoteDocker.mockResolvedValue({
			getContainer: () => ({ inspect: inspectContainer }),
			getNetwork: () => ({ inspect: inspectNetwork, connect }),
		});
		inspectContainer.mockResolvedValue({
			Id: "exact-traefik-id",
			NetworkSettings: { Networks: {} },
		});
		inspectNetwork.mockResolvedValue({ Id: "compose-network-id" });
		connect.mockResolvedValue(undefined);
	});
	it("does nothing when there are no isolated deployments", async () => {
		await reconnectServicesToTraefik();
		expect(mocks.getRemoteDocker).not.toHaveBeenCalled();
	});
	it.each([undefined, "server-id"])(
		"reconnects the exact Traefik container on %s",
		async (serverId) => {
			mocks.findMany.mockResolvedValue([{ appName: "first-compose" }]);
			await reconnectServicesToTraefik(serverId);
			expect(mocks.getRemoteDocker).toHaveBeenCalledWith(serverId);
			expect(connect).toHaveBeenCalledWith({ Container: "exact-traefik-id" });
		},
	);
	it("filters local and remote deployments by the selected server", async () => {
		await reconnectServicesToTraefik();
		const local = new PgDialect().sqlToQuery(
			mocks.findMany.mock.calls[0]![0].where,
		);
		expect(local.sql).toContain('"compose"."serverId" is null');
		await reconnectServicesToTraefik("server-id");
		const remote = new PgDialect().sqlToQuery(
			mocks.findMany.mock.calls[1]![0].where,
		);
		expect(remote.params).toContain("server-id");
		expect(remote.sql).not.toContain("is null");
	});
	it("does not reconnect existing attachments", async () => {
		mocks.findMany.mockResolvedValue([{ appName: "first-compose" }]);
		inspectContainer.mockResolvedValue({
			Id: "exact-traefik-id",
			NetworkSettings: { Networks: { "first-compose": {} } },
		});
		await reconnectServicesToTraefik();
		expect(connect).not.toHaveBeenCalled();
	});
	it("skips undeployed networks but reports connection failures", async () => {
		mocks.findMany.mockResolvedValue([{ appName: "first-compose" }]);
		inspectNetwork.mockRejectedValueOnce({ statusCode: 404 });
		await reconnectServicesToTraefik();
		expect(connect).not.toHaveBeenCalled();
		connect.mockRejectedValueOnce(new Error("connection failed"));
		await expect(reconnectServicesToTraefik()).rejects.toThrow(
			"connection failed",
		);
	});
	it("retries network reconnection on healthy containers after a partial recovery", async () => {
		mocks.ensureTraefikRunning
			.mockResolvedValueOnce(false)
			.mockResolvedValueOnce(true);
		await recoverTraefik();
		expect(mocks.findMany).toHaveBeenCalledOnce();
		await recoverTraefik("server-id", true);
		expect(mocks.ensureTraefikRunning).toHaveBeenLastCalledWith(
			"server-id",
			true,
		);
		expect(mocks.findMany).toHaveBeenCalledTimes(2);
	});
});
