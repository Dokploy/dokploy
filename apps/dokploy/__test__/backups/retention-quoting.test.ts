import { spawnSync } from "node:child_process";
import {
	chmodSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, onTestFinished, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execAsync: vi.fn() }));

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: vi.fn(async () => ({
		bucket: "bucket",
		accessKey: "key",
		secretAccessKey: "secret",
		region: "us-east-1",
		endpoint: "https://s3.example.com",
		provider: "AWS",
		additionalFlags: [],
	})),
}));

vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => ({
	...(await importOriginal<object>()),
	execAsync: mocks.execAsync,
}));

const { keepLatestNBackups } = await import("@dokploy/server/utils/backups");

describe("keepLatestNBackups", () => {
	it("passes a prefix containing spaces to rclone as a single path", async () => {
		const dir = mkdtempSync(join(tmpdir(), "rclone-shim-"));
		onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
		const log = join(dir, "calls.log");
		// Stand-in rclone: logs each call's argument count and path, lists two backups
		writeFileSync(
			join(dir, "rclone"),
			`#!/bin/bash
echo "$1 args=$# path=\${!#}" >> "${log}"
if [ "$1" = lsf ]; then printf '2024-01-02;new.sql.gz\\n2024-01-01;old.sql.gz\\n'; fi
`,
		);
		chmodSync(join(dir, "rclone"), 0o755);

		await keepLatestNBackups({
			keepLatestCount: 1,
			databaseType: "postgres",
			prefix: "my backups",
			appName: "web",
			destinationId: "dest",
			postgres: { appName: "pg-app" },
		} as any);

		const command = mocks.execAsync.mock.calls[0]?.[0] as string;
		const result = spawnSync("bash", ["-c", command], {
			encoding: "utf8",
			env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
		});
		expect(result.status).toBe(0);

		const calls = readFileSync(log, "utf8").trim().split("\n");
		expect(calls).toHaveLength(2);
		expect(calls[0]).toMatch(/^lsf .*path=:s3:bucket\/pg-app\/my backups\/$/);
		expect(calls[1]).toMatch(
			/^delete .*path=:s3:bucket\/pg-app\/my backups\/old\.sql\.gz$/,
		);
	});
});
