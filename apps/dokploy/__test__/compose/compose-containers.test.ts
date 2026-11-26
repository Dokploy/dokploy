import { getContainersByAppNameMatch } from "@dokploy/server/services/docker";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
}));

describe("getContainersByAppNameMatch", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockReset();
	});

	it("returns running and stopped containers for docker-compose", async () => {
		vi.mocked(execAsync).mockResolvedValue({
			stdout: [
				"CONTAINER ID : c12345678901 | Name: shop-web-1 | State: running | Status: Up 2 hours",
				"CONTAINER ID : c23456789012 | Name: shop-db-1 | State: exited | Status: Exited (0) 10 minutes ago",
			].join("\n"),
			stderr: "",
		});

		const containers = await getContainersByAppNameMatch(
			"shop",
			"docker-compose",
		);

		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("label=com.docker.compose.project=shop"),
		);
		expect(containers).toHaveLength(2);
		expect(containers[0]).toEqual({
			containerId: "c12345678901",
			name: "shop-web-1",
			state: "running",
			status: "Up 2 hours",
		});
		expect(containers[1]).toEqual({
			containerId: "c23456789012",
			name: "shop-db-1",
			state: "exited",
			status: "Exited (0) 10 minutes ago",
		});
	});

	it("returns stopped/shutdown stack containers without filtering them out", async () => {
		const divider = "__DOKPLOY_DIVIDER__";
		const tasksSection = [
			"TASK : t1 | Name: shop_web.1 | Node: node-1 | CurrentState: Shutdown 5 minutes ago | Error: ",
			"TASK : t2 | Name: shop_api.1 | Node: node-1 | CurrentState: Running 1 hour ago | Error: ",
		].join("\n");
		const inspectSection = [
			"TASK : t1 | ContainerId: c111111111111111111111111",
			"TASK : t2 | ContainerId: c222222222222222222222222",
		].join("\n");

		vi.mocked(execAsync).mockResolvedValue({
			stdout: `node-1\n${divider}\n${tasksSection}\n${divider}\n${inspectSection}`,
			stderr: "",
		});

		const containers = await getContainersByAppNameMatch("shop", "stack");

		// Crucially, it must not filter by desired-state=running
		const commandCalled = vi.mocked(execAsync).mock.calls[0]?.[0] ?? "";
		expect(commandCalled).not.toContain("desired-state=running");

		expect(containers).toHaveLength(2);
		expect(containers[0]).toEqual({
			containerId: "c11111111111",
			name: "shop_web.1.t1",
			node: "node-1",
			state: "shutdown",
			status: "Shutdown 5 minutes ago",
			taskId: "t1",
			local: true,
		});
		expect(containers[1]).toEqual({
			containerId: "c22222222222",
			name: "shop_api.1.t2",
			node: "node-1",
			state: "running",
			status: "Running 1 hour ago",
			taskId: "t2",
			local: true,
		});
	});

	it("deduplicates historical rolled-over tasks taking the latest task for each slot", async () => {
		const divider = "__DOKPLOY_DIVIDER__";
		// Swarm outputs latest first: shop_web.1 newest is Shutdown, older was Complete
		const tasksSection = [
			"TASK : t_new | Name: shop_web.1 | Node: node-1 | CurrentState: Shutdown 2 minutes ago | Error: ",
			"TASK : t_old | Name: shop_web.1 | Node: node-1 | CurrentState: Complete 1 hour ago | Error: ",
		].join("\n");
		const inspectSection = [
			"TASK : t_new | ContainerId: c_new_container_id",
			"TASK : t_old | ContainerId: c_old_container_id",
		].join("\n");

		vi.mocked(execAsync).mockResolvedValue({
			stdout: `node-1\n${divider}\n${tasksSection}\n${divider}\n${inspectSection}`,
			stderr: "",
		});

		const containers = await getContainersByAppNameMatch("shop", "stack");

		expect(containers).toHaveLength(1);
		expect(containers[0]).toEqual({
			containerId: "c_new_contai",
			name: "shop_web.1.t_new",
			node: "node-1",
			state: "shutdown",
			status: "Shutdown 2 minutes ago",
			taskId: "t_new",
			local: true,
		});
	});

	it("marks replicas on other nodes, whose logs can only be read through their task", async () => {
		const divider = "__DOKPLOY_DIVIDER__";
		const tasksSection = [
			"TASK : t1 | Name: shop_web.1 | Node: worker-1 | CurrentState: Running 9 minutes ago | Error: ",
			"TASK : t2 | Name: shop_web.2 | Node: manager-1 | CurrentState: Running 6 minutes ago | Error: ",
		].join("\n");
		const inspectSection = [
			"TASK : t1 | ContainerId: fea166d99873aaaaaaaaaaaaaa",
			"TASK : t2 | ContainerId: c222222222222222222222222",
		].join("\n");
		vi.mocked(execAsync).mockResolvedValue({
			stdout: `manager-1\n${divider}\n${tasksSection}\n${divider}\n${inspectSection}`,
			stderr: "",
		});

		const containers = await getContainersByAppNameMatch("shop", "stack");

		expect(vi.mocked(execAsync).mock.calls[0]?.[0]).toContain(
			"docker node inspect self",
		);
		expect(
			containers.map(({ name, node, taskId, local }) => ({
				name,
				node,
				taskId,
				local,
			})),
		).toEqual([
			{ name: "shop_web.1.t1", node: "worker-1", taskId: "t1", local: false },
			{ name: "shop_web.2.t2", node: "manager-1", taskId: "t2", local: true },
		]);
	});
});
