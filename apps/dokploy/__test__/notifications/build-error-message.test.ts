import { beforeEach, describe, expect, it, vi } from "vitest";

const mockExecAsync = vi.hoisted(() => vi.fn());
const mockExecAsyncRemote = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mockExecAsync,
	execAsyncRemote: mockExecAsyncRemote,
}));

import {
	formatBuildLogTail,
	getBuildErrorMessage,
} from "@dokploy/server/utils/notifications/build-error-message";
import { ExecError } from "@dokploy/server/utils/process/ExecError";

// Synthetic key material, not a real key.
const SCRIPT = `set -e; echo "-----BEGIN OPENSSH PRIVATE KEY-----
c3ludGhldGljLXRlc3Qta2V5
-----END OPENSSH PRIVATE KEY-----" > /tmp/id_rsa; nixpacks build /code`;
const LOG_PATH = "/etc/dokploy/logs/web-abc/web-abc-2026.log";

const buildFailure = () =>
	new ExecError(`Command execution failed: Command failed: ${SCRIPT}`, {
		command: SCRIPT,
		stdout: "",
		stderr: "",
		exitCode: 1,
	});

beforeEach(() => {
	vi.clearAllMocks();
});

describe("formatBuildLogTail", () => {
	it("keeps only the last lines of the log", () => {
		const log = Array.from({ length: 50 }, (_, i) => `line ${i + 1}`).join(
			"\n",
		);
		const tail = formatBuildLogTail(log, 3);
		expect(tail).toBe("line 48\nline 49\nline 50");
	});

	it("ignores trailing blank lines", () => {
		expect(formatBuildLogTail("a\nb\n\n\n", 2)).toBe("a\nb");
	});
});

describe("getBuildErrorMessage", () => {
	it("uses the build log, never the build script, for a failed build", async () => {
		mockExecAsync.mockResolvedValue({
			stdout:
				"src/index.ts:3:7 - error TS2322: Type 'number' is not assignable to type 'string'.\n❌ Nixpacks build failed\n",
			stderr: "",
		});

		const message = await getBuildErrorMessage(buildFailure(), LOG_PATH);

		expect(message).toContain("error TS2322");
		expect(message).not.toContain("PRIVATE KEY");
		expect(message).not.toContain("c3ludGhldGljLXRlc3Qta2V5");
		expect(mockExecAsync).toHaveBeenCalledWith(`tail -n 30 ${LOG_PATH}`);
		expect(mockExecAsyncRemote).not.toHaveBeenCalled();
	});

	it("reads the log on the build server for remote builds", async () => {
		mockExecAsyncRemote.mockResolvedValue({
			stdout: "build failed\n",
			stderr: "",
		});

		const message = await getBuildErrorMessage(
			buildFailure(),
			LOG_PATH,
			"server-1",
		);

		expect(message).toBe("build failed");
		expect(mockExecAsyncRemote).toHaveBeenCalledWith(
			"server-1",
			`tail -n 30 ${LOG_PATH}`,
		);
	});

	it("falls back to a generic message when the log cannot be read", async () => {
		mockExecAsync.mockRejectedValue(new Error("No such file"));

		const message = await getBuildErrorMessage(buildFailure(), LOG_PATH);

		expect(message).toBe("Error building");
	});

	it("keeps the message of errors that are not build commands", async () => {
		const message = await getBuildErrorMessage(
			new Error("Repository not found"),
			LOG_PATH,
		);

		expect(message).toBe("Repository not found");
		expect(mockExecAsync).not.toHaveBeenCalled();
	});
});
