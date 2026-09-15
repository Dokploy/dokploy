import { ExecError } from "@dokploy/server/utils/process/ExecError";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
}));

const { runRsyncWithVanishedRetry } = await import(
	"@dokploy/server/utils/backups/rsync"
);

const RSYNC_COMMAND = "rsync -a /etc/dokploy/ /tmp/backup/filesystem/";

const vanishedError = (paths: string[]) =>
	new ExecError("Command failed", {
		command: RSYNC_COMMAND,
		exitCode: 24,
		stderr: `${paths
			.map((path) => `file has vanished: "${path}"`)
			.join(
				"\n",
			)}\nrsync warning: some files vanished before they could be transferred (code 24) at main.c(1347) [sender=3.2.7]`,
	});

describe("runRsyncWithVanishedRetry", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.execAsync.mockResolvedValue({ stdout: "", stderr: "" });
	});

	it("runs the command once and logs nothing when rsync succeeds", async () => {
		const log = vi.fn();

		await runRsyncWithVanishedRetry(RSYNC_COMMAND, log);

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(mocks.execAsync).toHaveBeenCalledWith(RSYNC_COMMAND);
		expect(log).not.toHaveBeenCalled();
	});

	it("retries once and succeeds when files vanished during the first pass", async () => {
		const log = vi.fn();
		mocks.execAsync
			.mockRejectedValueOnce(
				vanishedError([
					"/etc/dokploy/compose/app/files/volumes/db/data/pg_logical/snapshots/0-2700.snap",
				]),
			)
			.mockResolvedValueOnce({ stdout: "", stderr: "" });

		await runRsyncWithVanishedRetry(RSYNC_COMMAND, log);

		expect(mocks.execAsync).toHaveBeenCalledTimes(2);
		const logged = log.mock.calls.flat().join("");
		expect(logged).toContain("0-2700.snap");
		expect(logged).toContain("Retrying the copy once");
		expect(logged).not.toContain("continuing without them");
	});

	it("continues after logging the paths when files vanish on the retry as well", async () => {
		const log = vi.fn();
		mocks.execAsync
			.mockRejectedValueOnce(vanishedError(["/etc/dokploy/a.snap"]))
			.mockRejectedValueOnce(vanishedError(["/etc/dokploy/b.snap"]));

		await expect(
			runRsyncWithVanishedRetry(RSYNC_COMMAND, log),
		).resolves.toBeUndefined();

		expect(mocks.execAsync).toHaveBeenCalledTimes(2);
		const logged = log.mock.calls.flat().join("");
		expect(logged).toContain("/etc/dokploy/b.snap");
		expect(logged).toContain("continuing without them");
	});

	it("truncates the logged paths when many files vanished", async () => {
		const log = vi.fn();
		const paths = Array.from(
			{ length: 12 },
			(_, index) => `/etc/dokploy/snapshot-${index}.snap`,
		);
		mocks.execAsync
			.mockRejectedValueOnce(vanishedError(paths))
			.mockResolvedValueOnce({ stdout: "", stderr: "" });

		await runRsyncWithVanishedRetry(RSYNC_COMMAND, log);

		const logged = log.mock.calls.flat().join("");
		expect(logged).toContain("/etc/dokploy/snapshot-9.snap");
		expect(logged).not.toContain("/etc/dokploy/snapshot-10.snap");
		expect(logged).toContain("...and 2 more");
	});

	it("rethrows other rsync exit codes without retrying", async () => {
		const log = vi.fn();
		mocks.execAsync.mockRejectedValueOnce(
			new ExecError("Command failed", {
				command: RSYNC_COMMAND,
				exitCode: 23,
				stderr: "rsync error: some files/attrs were not transferred (code 23)",
			}),
		);

		await expect(
			runRsyncWithVanishedRetry(RSYNC_COMMAND, log),
		).rejects.toBeInstanceOf(ExecError);

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
		expect(log).not.toHaveBeenCalled();
	});

	it("rethrows failures that are not exec errors", async () => {
		const log = vi.fn();
		mocks.execAsync.mockRejectedValueOnce(new Error("rsync is not installed"));

		await expect(runRsyncWithVanishedRetry(RSYNC_COMMAND, log)).rejects.toThrow(
			"rsync is not installed",
		);

		expect(mocks.execAsync).toHaveBeenCalledTimes(1);
	});
});
