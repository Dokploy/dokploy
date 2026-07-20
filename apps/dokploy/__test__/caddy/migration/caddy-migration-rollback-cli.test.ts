import { beforeEach, describe, expect, test, vi } from "vitest";

const rollbackCaddyMigrationMock = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server", () => ({
	rollbackCaddyMigration: rollbackCaddyMigrationMock,
}));

import {
	parseCaddyRollbackArgs,
	runCaddyMigrationRollbackCli,
} from "../../../scripts/caddy-migration-rollback";

const createIo = () => ({
	stdout: { write: vi.fn() },
	stderr: { write: vi.fn() },
});

describe("caddy migration rollback CLI", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	test("requires a migration id", async () => {
		expect(() => parseCaddyRollbackArgs([])).toThrow("Missing --migration-id");

		const io = createIo();
		const code = await runCaddyMigrationRollbackCli([], io);

		expect(code).toBe(1);
		expect(rollbackCaddyMigrationMock).not.toHaveBeenCalled();
		expect(io.stderr.write).toHaveBeenCalledWith(
			expect.stringContaining("Missing --migration-id"),
		);
	});

	test("prints help and exits zero without invoking rollback", async () => {
		const io = createIo();

		const code = await runCaddyMigrationRollbackCli(["--help"], io);

		expect(code).toBe(0);
		expect(rollbackCaddyMigrationMock).not.toHaveBeenCalled();
		expect(io.stdout.write).toHaveBeenCalledWith(
			expect.stringContaining("Usage: caddy-migration-rollback"),
		);
		expect(io.stderr.write).not.toHaveBeenCalled();
	});

	test("awaits rollback and exits zero for rolled_back reports", async () => {
		rollbackCaddyMigrationMock.mockResolvedValueOnce({
			migrationId: "caddy-123",
			status: "rolled_back",
			warnings: [],
			summary: { warnings: 0, blockingWarnings: 0, fragments: 1, routes: 1 },
			artifactPaths: { reportJson: "/tmp/report.json" },
		});
		const io = createIo();

		const code = await runCaddyMigrationRollbackCli(
			["--migration-id", "caddy-123", "--server-id", "server-1"],
			io,
		);

		expect(code).toBe(0);
		expect(rollbackCaddyMigrationMock).toHaveBeenCalledWith({
			migrationId: "caddy-123",
			serverId: "server-1",
		});
		expect(io.stdout.write).toHaveBeenCalledWith(
			expect.stringContaining('"status": "rolled_back"'),
		);
	});

	test("exits non-zero for non-rolled-back terminal reports", async () => {
		rollbackCaddyMigrationMock.mockResolvedValueOnce({
			migrationId: "caddy-123",
			status: "failed",
			warnings: [],
			summary: { warnings: 1, blockingWarnings: 1, fragments: 1, routes: 1 },
			artifactPaths: { reportJson: "/tmp/report.json" },
		});
		const io = createIo();

		const code = await runCaddyMigrationRollbackCli(
			["--migration-id", "caddy-123"],
			io,
		);

		expect(code).toBe(1);
		expect(io.stdout.write).toHaveBeenCalledWith(
			expect.stringContaining('"status": "failed"'),
		);
	});
});
