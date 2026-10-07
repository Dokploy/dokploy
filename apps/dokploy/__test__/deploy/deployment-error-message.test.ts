import { promises as fsPromises } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
	ExecError: class ExecError extends Error {},
}));

import { getDeploymentErrorMessage } from "@dokploy/server/services/deployment";

const FALLBACK = "Error building, check the logs for details.";

// The private key that gets echoed into the deploy command. The bug was that
// Node's exec error.message (the whole command string, including this echo)
// was sent to notifications. The real build error lives in the log file, which
// never contains the key, so reading the log must never surface it.
const PRIVATE_KEY = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW
SECRETKEYMATERIALSHOULDNEVERLEAK
-----END OPENSSH PRIVATE KEY-----`;

describe("getDeploymentErrorMessage", () => {
	let tmpDir: string;

	beforeEach(async () => {
		vi.clearAllMocks();
		tmpDir = await fsPromises.mkdtemp(
			path.join(os.tmpdir(), "dokploy-log-test-"),
		);
	});

	afterEach(async () => {
		await fsPromises.rm(tmpDir, { recursive: true, force: true });
	});

	describe("local deployments (no serverId)", () => {
		it("returns the real build error from the log, not the fallback", async () => {
			const logPath = path.join(tmpDir, "build.log");
			const realError = [
				"Cloning Repo Custom ...: ✅",
				"#5 ERROR: failed to build: npm run build exited with code 1",
				"error: cannot find module './missing'",
			].join("\n");
			await fsPromises.writeFile(logPath, realError);

			const result = await getDeploymentErrorMessage({
				logPath,
				serverId: null,
				fallback: FALLBACK,
			});

			expect(result).toContain("failed to build");
			expect(result).toContain("cannot find module");
			expect(result).not.toBe(FALLBACK);
		});

		it("returns only the log content, so the key in the command string never leaks", async () => {
			// The bug: Node's exec error.message is the whole command string, which
			// includes the `echo "<private key>"` from the clone step. This function
			// only ever reads the log file (which never contains the key), so the
			// notification message is sourced from the log, not that command string.
			const logPath = path.join(tmpDir, "build.log");
			const realError = "#5 ERROR: failed to build the application";
			await fsPromises.writeFile(logPath, realError);

			const result = await getDeploymentErrorMessage({
				logPath,
				serverId: null,
				fallback: FALLBACK,
			});

			expect(result).toBe(realError);
			expect(result).not.toContain(PRIVATE_KEY);
			expect(result).not.toContain("BEGIN OPENSSH PRIVATE KEY");
		});

		it("returns the fallback when the log file does not exist", async () => {
			const result = await getDeploymentErrorMessage({
				logPath: path.join(tmpDir, "does-not-exist.log"),
				serverId: null,
				fallback: FALLBACK,
			});

			expect(result).toBe(FALLBACK);
		});

		it("returns the fallback when the log file is empty", async () => {
			const logPath = path.join(tmpDir, "empty.log");
			await fsPromises.writeFile(logPath, "   \n  \n");

			const result = await getDeploymentErrorMessage({
				logPath,
				serverId: null,
				fallback: FALLBACK,
			});

			expect(result).toBe(FALLBACK);
		});

		it("returns the fallback for an empty or '.' log path", async () => {
			expect(
				await getDeploymentErrorMessage({
					logPath: "",
					serverId: null,
					fallback: FALLBACK,
				}),
			).toBe(FALLBACK);
			expect(
				await getDeploymentErrorMessage({
					logPath: ".",
					serverId: null,
					fallback: FALLBACK,
				}),
			).toBe(FALLBACK);
		});

		it("only returns the last `maxLines` lines of the log", async () => {
			const logPath = path.join(tmpDir, "long.log");
			const lines = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`);
			await fsPromises.writeFile(logPath, lines.join("\n"));

			const result = await getDeploymentErrorMessage({
				logPath,
				serverId: null,
				fallback: FALLBACK,
				maxLines: 10,
			});

			const resultLines = result.split("\n");
			expect(resultLines).toHaveLength(10);
			expect(resultLines[0]).toBe("line 91");
			expect(resultLines[9]).toBe("line 100");
		});
	});

	describe("remote deployments (with serverId)", () => {
		it("reads the log tail over SSH and returns it", async () => {
			vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
				stdout: "#5 ERROR: failed to build on remote server\n",
				stderr: "",
			});

			const result = await getDeploymentErrorMessage({
				logPath: "/etc/dokploy/logs/test/build.log",
				serverId: "server-1",
				fallback: FALLBACK,
			});

			expect(result).toBe("#5 ERROR: failed to build on remote server");
			expect(execProcess.execAsyncRemote).toHaveBeenCalledWith(
				"server-1",
				expect.stringContaining("tail -n 50 /etc/dokploy/logs/test/build.log"),
			);
		});

		it("returns the fallback when the remote read fails", async () => {
			vi.mocked(execProcess.execAsyncRemote).mockRejectedValue(
				new Error("ssh connection refused"),
			);

			const result = await getDeploymentErrorMessage({
				logPath: "/etc/dokploy/logs/test/build.log",
				serverId: "server-1",
				fallback: FALLBACK,
			});

			expect(result).toBe(FALLBACK);
		});

		it("returns the fallback when the remote log is empty", async () => {
			vi.mocked(execProcess.execAsyncRemote).mockResolvedValue({
				stdout: "\n  \n",
				stderr: "",
			});

			const result = await getDeploymentErrorMessage({
				logPath: "/etc/dokploy/logs/test/build.log",
				serverId: "server-1",
				fallback: FALLBACK,
			});

			expect(result).toBe(FALLBACK);
		});
	});
});
