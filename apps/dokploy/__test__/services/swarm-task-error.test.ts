import {
	getContainersByAppNameMatch,
	getServiceContainersByAppName,
	getStackContainersByAppName,
} from "@dokploy/server/services/docker";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
}));

const mockStdout = (stdout: string) =>
	vi.mocked(execAsync).mockResolvedValue({ stdout, stderr: "" });

const psRow = (id: string, error: string) =>
	`CONTAINER ID : ${id} | Name: web.${id} | State: Running | Node: worker | CurrentState: Running 42 seconds ago | Error: ${error}`;

beforeEach(() => {
	vi.mocked(execAsync).mockReset();
});

describe("stack task containers", () => {
	const taskRow = (id: string, error: string) =>
		`TASK : ${id} | Name: web | Node: worker | CurrentState: Running 42 seconds ago | Error: ${error}`;

	it("adds no error suffix when the last task has an empty error", async () => {
		mockStdout(
			`${taskRow("t1", "")}\n${taskRow("t2", "")}\n__DOKPLOY_DIVIDER__\n`,
		);

		const containers = await getContainersByAppNameMatch("web", "stack");

		expect(containers.map((c) => c.status)).toEqual([
			"Running 42 seconds ago",
			"Running 42 seconds ago",
		]);
	});

	it("keeps a real error on the last task", async () => {
		mockStdout(
			`${taskRow("t1", "")}\n${taskRow("t2", "task: non-zero exit (1)")}\n__DOKPLOY_DIVIDER__\n`,
		);

		const containers = await getContainersByAppNameMatch("web", "stack");

		expect(containers[1]?.status).toBe(
			"Running 42 seconds ago (task: non-zero exit (1))",
		);
	});
});

describe.each([
	["getStackContainersByAppName", getStackContainersByAppName],
	["getServiceContainersByAppName", getServiceContainersByAppName],
])("%s", (_name, getContainers) => {
	it("returns an empty error for the last row without one", async () => {
		mockStdout(`${psRow("a", "")}\n${psRow("b", "")}\n`);

		const containers = await getContainers("web");

		expect(containers.map((c) => c.error)).toEqual(["", ""]);
	});

	it("keeps a real error on the last row", async () => {
		mockStdout(`${psRow("a", "")}\n${psRow("b", "No such image: web:1")}\n`);

		const containers = await getContainers("web");

		expect(containers[1]?.error).toBe("No such image: web:1");
	});
});
