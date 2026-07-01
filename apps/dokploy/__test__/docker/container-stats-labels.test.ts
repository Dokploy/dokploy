import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

const { getAllContainerStats } = await import(
	"../../../../packages/server/src/services/docker"
);

describe("getAllContainerStats", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("enriches container stats with labels from docker ps output", async () => {
		const statsLine = JSON.stringify({
			BlockIO: "0B / 0B",
			CPUPerc: "0.00%",
			Container: "abc123",
			ID: "abc123",
			MemPerc: "0.00%",
			MemUsage: "0B / 0B",
			Name: "allowed-service.1.task",
			NetIO: "0B / 0B",
		});
		const sizeLine = JSON.stringify({
			ID: "abc123",
			Labels:
				"com.docker.swarm.service.name=allowed-service,com.docker.stack.namespace=stack-app",
			Name: "allowed-service.1.task",
			Size: "12B (virtual 34B)",
		});

		mocks.execAsync.mockImplementation(async (command: string) => {
			if (command.includes("docker stats --no-stream")) {
				return {
					stderr: "",
					stdout: `${statsLine}\n`,
				};
			}

			if (command.includes("docker ps --size")) {
				return {
					stderr: "",
					stdout: `${sizeLine}\n`,
				};
			}

			throw new Error(`Unexpected command: ${command}`);
		});

		await expect(getAllContainerStats()).resolves.toEqual([
			expect.objectContaining({
				ID: "abc123",
				Labels: {
					"com.docker.stack.namespace": "stack-app",
					"com.docker.swarm.service.name": "allowed-service",
				},
				Size: "12B (virtual 34B)",
			}),
		]);
		expect(mocks.execAsync.mock.calls[1]?.[0]).toContain(
			'"Labels":{{json .Labels}}',
		);
	});
});
