import { describe, expect, it, vi } from "vitest";
import * as execAsyncModule from "@dokploy/server/utils/process/execAsync";
import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { getContainerLogs } from "@dokploy/server/services/docker";

describe("getContainerLogs", () => {
	it("should return empty string instead of throwing when grep finds no matches (exit code 1)", async () => {
		const execAsyncSpy = vi.spyOn(execAsyncModule, "execAsync");

		execAsyncSpy.mockImplementation(async (command: string) => {
			if (command.includes("docker ps -q")) {
				return { stdout: "container123\n", stderr: "" };
			}
			if (command.includes("grep")) {
				throw new ExecError("Command execution failed", {
					command,
					stdout: "",
					stderr: "",
					exitCode: 1,
				});
			}
			return { stdout: "", stderr: "" };
		});

		const result = await getContainerLogs("my-app", 50, "all", "nonexistent");
		expect(result).toBe("");

		execAsyncSpy.mockRestore();
	});

	it("should filter logs with grep and then limit with tail -n", async () => {
		const execAsyncSpy = vi.spyOn(execAsyncModule, "execAsync");

		let executedLogCommand = "";
		execAsyncSpy.mockImplementation(async (command: string) => {
			if (command.includes("docker ps -q")) {
				return { stdout: "container123\n", stderr: "" };
			}
			if (command.includes("docker container logs")) {
				executedLogCommand = command;
				return { stdout: "match line 1\nmatch line 2\n", stderr: "" };
			}
			return { stdout: "", stderr: "" };
		});

		const result = await getContainerLogs("my-app", 10, "all", "match");
		expect(result).toBe("match line 1\nmatch line 2\n");
		expect(executedLogCommand).toContain("grep -iF 'match' | tail -n 10");
		expect(executedLogCommand).not.toContain(
			"docker container logs --timestamps --tail",
		);

		execAsyncSpy.mockRestore();
	});

	it("should re-throw error if grep fails with an exit code other than 1", async () => {
		const execAsyncSpy = vi.spyOn(execAsyncModule, "execAsync");

		execAsyncSpy.mockImplementation(async (command: string) => {
			if (command.includes("docker ps -q")) {
				return { stdout: "container123\n", stderr: "" };
			}
			if (command.includes("grep")) {
				throw new ExecError("Command execution failed", {
					command,
					stdout: "",
					stderr: "unexpected error",
					exitCode: 2,
				});
			}
			return { stdout: "", stderr: "" };
		});

		await expect(
			getContainerLogs("my-app", 50, "all", "error-search"),
		).rejects.toThrow("Command execution failed");

		execAsyncSpy.mockRestore();
	});
});
