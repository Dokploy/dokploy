import { beforeEach, describe, expect, it, vi } from "vitest";

// A fake host answers the handful of docker commands the lookup runs.
type Host = {
	nodeId: string;
	ps?: string[];
	tasks?: Record<string, { nodeId: string; containerId: string }>;
	nodes?: Record<string, string>;
};

let hosts: Record<string, Host> = {};

const answer = (hostKey: string, command: string) => {
	const host = hosts[hostKey];
	if (!host) throw new Error(`unreachable host ${hostKey}`);
	if (command.startsWith("docker info")) {
		return { stdout: `${host.nodeId}\n`, stderr: "" };
	}
	if (command.startsWith("docker ps")) {
		const name = command.match(/Name: ([\w.-]+)'/)?.[1] ?? "";
		const lines = (host.ps ?? []).filter((l) => l.includes(`Name: ${name}`));
		return { stdout: lines.join("\n"), stderr: "" };
	}
	if (command.startsWith("docker service ps")) {
		return { stdout: Object.keys(host.tasks ?? {}).join("\n"), stderr: "" };
	}
	if (command.startsWith("docker inspect")) {
		const lines = Object.entries(host.tasks ?? {})
			.filter(([taskId]) => command.includes(taskId))
			.map(([, t]) => `${t.nodeId}|${t.containerId}`);
		return { stdout: lines.join("\n"), stderr: "" };
	}
	if (command.startsWith("docker node ls")) {
		const lines = Object.entries(host.nodes ?? {}).map(
			([id, hostname]) => `${id}|${hostname}`,
		);
		return { stdout: lines.join("\n"), stderr: "" };
	}
	throw new Error(`unexpected command: ${command}`);
};

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	ExecError: class extends Error {},
	execAsync: vi.fn(async (command: string) => answer("local", command)),
	execAsyncRemote: vi.fn(async (serverId: string, command: string) =>
		answer(serverId, command),
	),
}));

const psLine = (id: string, name: string) =>
	`CONTAINER ID : ${id} | Name: ${name} | State: running | Status: Up 2 hours`;

const C1 = `aaaaaaaaaaaa${"1".repeat(52)}`;
const C2 = `bbbbbbbbbbbb${"2".repeat(52)}`;
const C3 = `cccccccccccc${"3".repeat(52)}`;

const load = async () => {
	vi.resetModules();
	return import("@dokploy/server/services/docker");
};

describe("getContainersByAppNameMatch across swarm nodes", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		hosts = {
			local: {
				nodeId: "node-1",
				ps: [psLine(C1.slice(0, 12), "app-web.1.task1")],
				tasks: {
					task1: { nodeId: "node-1", containerId: C1 },
					task2: { nodeId: "node-2", containerId: C2 },
					task3: { nodeId: "node-3", containerId: C3 },
				},
				nodes: {
					"node-1": "dokploy-01",
					"node-2": "dokploy-02",
					"node-3": "dokploy-03",
				},
			},
			"server-2": {
				nodeId: "node-2",
				ps: [
					psLine(C2.slice(0, 12), "app-web.2.task2"),
					// an old exited task of the same service must not be listed
					psLine("dddddddddddd", "app-web.2.oldtask"),
				],
			},
			"server-unrelated": { nodeId: "node-9" },
		};
	});

	it("lists tasks on other nodes with the remote server that runs them", async () => {
		const { getContainersByAppNameMatch } = await load();

		const result = await getContainersByAppNameMatch(
			"app-web",
			undefined,
			undefined,
			["server-2", "server-unrelated"],
		);

		expect(result).toEqual([
			{
				containerId: C1.slice(0, 12),
				name: "app-web.1.task1",
				state: "running",
				status: "Up 2 hours",
			},
			{
				containerId: C2.slice(0, 12),
				name: "app-web.2.task2",
				state: "running",
				status: "Up 2 hours",
				serverId: "server-2",
				node: "dokploy-02",
			},
			{
				containerId: C3.slice(0, 12),
				name: "app-web",
				state: "running",
				status: "",
				node: "dokploy-03",
				unreachable: true,
			},
		]);
	});

	it("keeps the old behaviour on a standalone docker host", async () => {
		hosts.local = {
			nodeId: "",
			ps: [psLine(C1.slice(0, 12), "app-web")],
		};
		const { getContainersByAppNameMatch } = await load();
		const { execAsyncRemote } = await import(
			"@dokploy/server/utils/process/execAsync"
		);

		const result = await getContainersByAppNameMatch(
			"app-web",
			undefined,
			undefined,
			["server-2"],
		);

		expect(result.map((c) => c.containerId)).toEqual([C1.slice(0, 12)]);
		expect(execAsyncRemote).not.toHaveBeenCalled();
	});

	it("does not query the swarm for docker-compose apps", async () => {
		const { getContainersByAppNameMatch } = await load();
		const { execAsync } = await import(
			"@dokploy/server/utils/process/execAsync"
		);

		await getContainersByAppNameMatch("app-web", "docker-compose", undefined, [
			"server-2",
		]);

		const commands = vi.mocked(execAsync).mock.calls.map(([c]) => c);
		expect(commands.some((c) => c.startsWith("docker service ps"))).toBe(false);
	});

	it("falls back to the local list when the swarm lookup fails", async () => {
		hosts.local.tasks = undefined;
		const { getContainersByAppNameMatch } = await load();
		const { execAsync } = await import(
			"@dokploy/server/utils/process/execAsync"
		);
		vi.mocked(execAsync).mockImplementation(async (command: string) => {
			if (command.startsWith("docker service ps")) {
				throw new Error("no such service");
			}
			return answer("local", command);
		});

		const result = await getContainersByAppNameMatch(
			"app-web",
			undefined,
			undefined,
			["server-2"],
		);

		expect(result.map((c) => c.containerId)).toEqual([C1.slice(0, 12)]);
	});
});
