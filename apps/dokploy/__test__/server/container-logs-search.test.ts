import { exec } from "node:child_process";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";

const LOG_LINES =
	"2026-01-01T00:00:00Z ready\n2026-01-01T00:00:01Z request ok\n";

// Run the real command through /bin/sh, swapping the `docker ... logs` call
// for a printf so the test exercises the grep pipeline without docker.
const runWithFakeDocker = async (cmd: string) =>
	promisify(exec)(
		cmd.replace(
			/^docker (container|service) logs [^|]*?2>&1/,
			`printf '${LOG_LINES}' 2>&1`,
		),
		{ shell: "/bin/sh" },
	);

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	execAsyncRemote: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	ExecError: class ExecError extends Error {},
	execAsync: mocks.execAsync,
	execAsyncRemote: mocks.execAsyncRemote,
}));

import { getContainerLogs } from "@dokploy/server/services/docker";

describe("getContainerLogs search", () => {
	beforeEach(() => {
		mocks.execAsync.mockReset();
		mocks.execAsync.mockImplementation(runWithFakeDocker);
	});

	it("returns matching lines", async () => {
		const logs = await getContainerLogs(
			"abc123",
			100,
			"all",
			"READY",
			null,
			true,
		);
		expect(logs).toBe("2026-01-01T00:00:00Z ready\n");
	});

	it("returns an empty result instead of throwing when nothing matches", async () => {
		await expect(
			getContainerLogs("abc123", 100, "all", "no-such-entry", null, true),
		).resolves.toBe("");
	});

	it("returns all lines when no search is given", async () => {
		const logs = await getContainerLogs(
			"abc123",
			100,
			"all",
			undefined,
			null,
			true,
		);
		expect(logs).toBe(LOG_LINES);
	});
});
