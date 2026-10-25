import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
	buildLogSearchCommand,
	getContainerLogs,
} from "@dokploy/server/services/docker";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn(),
}));

const runShell = promisify(exec);

const fakeLogs = `printf '%s\\n' \
	'2026-10-07T04:39:18Z Starting node -v check' \
	'2026-10-07T04:39:19Z Prisma schema loaded' \
	'2026-10-07T04:39:22Z [PrismaService] Prisma client connected' \
	'2026-10-07T05:00:00Z [ImportProcessor] Scheduled import triggered' \
	'2026-10-07T05:00:03Z [ImportService] Scheduled import finished'`;

describe.skipIf(process.platform === "win32")("buildLogSearchCommand", () => {
	it("returns an empty result when nothing matches", async () => {
		const { stdout } = await runShell(
			buildLogSearchCommand(fakeLogs, "textthatdoesnotexist", 50),
		);
		expect(stdout).toBe("");
	});

	it("finds matches older than the last tail lines", async () => {
		const { stdout } = await runShell(
			buildLogSearchCommand(fakeLogs, "prisma", 5),
		);
		expect(stdout.trim().split("\n")).toEqual([
			"2026-10-07T04:39:19Z Prisma schema loaded",
			"2026-10-07T04:39:22Z [PrismaService] Prisma client connected",
		]);
	});

	it("keeps only the last tail matches", async () => {
		const { stdout } = await runShell(
			buildLogSearchCommand(fakeLogs, "scheduled import", 1),
		);
		expect(stdout).toBe(
			"2026-10-07T05:00:03Z [ImportService] Scheduled import finished\n",
		);
	});

	it("handles search text containing single quotes", async () => {
		const { stdout } = await runShell(
			buildLogSearchCommand(fakeLogs, "it's", 5),
		);
		expect(stdout).toBe("");
	});

	it("treats a search starting with a dash as text", async () => {
		const { stdout } = await runShell(buildLogSearchCommand(fakeLogs, "-v", 5));
		expect(stdout).toBe("2026-10-07T04:39:18Z Starting node -v check\n");
	});
});

describe("getContainerLogs", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockReset();
		vi.mocked(execAsync).mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("applies tail to the docker logs when not searching", async () => {
		await getContainerLogs("abc123", 50, "all", undefined, null, true);

		expect(execAsync).toHaveBeenCalledWith(
			expect.stringMatching(
				/^docker container logs --timestamps --tail 50 .*abc123 2>&1$/,
			),
		);
	});

	it("applies tail to the matches when searching", async () => {
		vi.mocked(execAsync).mockResolvedValue({ stdout: "match\n", stderr: "" });

		await getContainerLogs("abc123", 5, "24h", "Prisma", null, true);

		const command = vi.mocked(execAsync).mock.calls[0]?.[0] ?? "";
		expect(command).not.toContain("--tail");
		expect(command).toContain("--since 24h");
		expect(command).toMatch(/\| grep -iF -- 'Prisma' \| tail -n 5$/);
		expect(execAsync).toHaveBeenCalledTimes(1);
	});

	it("checks the logs are readable when the search has no matches", async () => {
		await expect(
			getContainerLogs("abc123", 100, "all", "nothing", null, true),
		).resolves.toBe("");
		expect(execAsync).toHaveBeenLastCalledWith(
			"docker container logs --timestamps --tail 0 abc123",
		);
	});

	it("returns partial search output when it exceeds the exec buffer", async () => {
		vi.mocked(execAsync).mockRejectedValueOnce(
			Object.assign(new Error("stdout maxBuffer length exceeded"), {
				stdout: "partial match\n",
			}),
		);

		await expect(
			getContainerLogs("abc123", 10000, "all", "match", null, true),
		).resolves.toBe("partial match\n");
		expect(execAsync).toHaveBeenCalledTimes(1);
	});

	it("throws when the logs cannot be read", async () => {
		vi.mocked(execAsync)
			.mockResolvedValueOnce({ stdout: "", stderr: "" })
			.mockRejectedValueOnce(new Error("No such container: abc123"));

		await expect(
			getContainerLogs("abc123", 100, "all", "nothing", null, true),
		).rejects.toThrow("No such container: abc123");
	});
});
