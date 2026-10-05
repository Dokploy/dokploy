import { execSync } from "node:child_process";
import {
	chmodSync,
	existsSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import type { Destination } from "@dokploy/server/services/destination";
import { getKeepLatestNBackupsCommand } from "@dokploy/server/utils/backups/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A stub replacing the real `rclone` binary. It logs every argv entry and,
// for `lsf`, prints two fake backup files so the xargs-driven `rclone delete`
// leg of the pipeline also executes. This exercises the real shell quoting of
// the generated command without needing S3.
const stub = `/tmp/rclone_stub_${process.pid}`;
const LOG = `/tmp/rclone_argv_${process.pid}.log`;

beforeAll(() => {
	writeFileSync(
		stub,
		`#!/bin/bash
{
echo "SUBCMD <$1>"
i=1
for a in "$@"; do echo "ARG[$i] <$a>"; i=$((i+1)); done
} >> "${LOG}"
if [ "$1" = "lsf" ]; then
	printf '2026-01-01T00-00-00-000Z.sql.gz\\n2026-01-02T00-00-00-000Z.sql.gz\\n'
fi
exit 0
`,
	);
	chmodSync(stub, 0o755);
});

afterAll(() => {
	if (existsSync(stub)) rmSync(stub);
	if (existsSync(LOG)) rmSync(LOG);
});

const destination = {
	bucket: "mybucket",
	accessKey: "AKID",
	secretAccessKey: "SECRET",
	region: "us-east-1",
	endpoint: "https://s3.example.com",
	provider: "Other",
	additionalFlags: [],
} as unknown as Destination;

const backup = (prefix: string, keepLatestCount = 1) =>
	({
		prefix,
		databaseType: "postgres",
		keepLatestCount,
	}) as Parameters<typeof getKeepLatestNBackupsCommand>[0];

// Run the generated pipeline with `rclone` pointed at the stub; return the
// argv the stub observed, grouped per rclone invocation.
const runPipeline = (command: string): string[][] => {
	if (existsSync(LOG)) rmSync(LOG);
	const withStub = command.replace(/(^|[\s;|&])rclone /g, `$1${stub} `);
	execSync(withStub, {
		shell: "/bin/bash",
		stdio: "ignore",
		env: { ...process.env },
	});
	const invocations: string[][] = [];
	let current: string[] = [];
	for (const line of readFileSync(LOG, "utf8").split("\n")) {
		const arg = line.match(/^ARG\[\d+\] <(.*)>$/);
		if (line.startsWith("SUBCMD")) {
			if (current.length) invocations.push(current);
			current = [];
		} else if (arg) {
			current.push(arg[1]);
		}
	}
	if (current.length) invocations.push(current);
	return invocations;
};

describe("getKeepLatestNBackupsCommand", () => {
	it("returns null when keepLatestCount is 0", () => {
		expect(
			getKeepLatestNBackupsCommand(backup("prefix", 0), destination, "myapp"),
		).toBeNull();
	});

	it("passes a prefix containing spaces to rclone lsf as a single argument", () => {
		const command = getKeepLatestNBackupsCommand(
			backup("my prefix"),
			destination,
			"myapp",
		);
		expect(command).not.toBeNull();
		const [lsfArgs] = runPipeline(command!);
		// lsf argv: ["lsf", flags..., --include, pattern, <path>]
		expect(lsfArgs[0]).toBe("lsf");
		expect(lsfArgs).toContain(":s3:mybucket/myapp/my prefix/");
	});

	it("passes a prefix containing spaces to rclone delete as a single argument", () => {
		const command = getKeepLatestNBackupsCommand(
			backup("my prefix"),
			destination,
			"myapp",
		);
		expect(command).not.toBeNull();
		const [, deleteArgs] = runPipeline(command!);
		// keepLatestCount=1: newest file is kept, older one is deleted
		expect(deleteArgs[0]).toBe("delete");
		expect(deleteArgs).toContain(
			":s3:mybucket/myapp/my prefix/2026-01-01T00-00-00-000Z.sql.gz",
		);
	});

	it("keeps working for a prefix with hyphens (issue #4354)", () => {
		const command = getKeepLatestNBackupsCommand(
			backup("English-Program"),
			destination,
			"myapp",
		);
		expect(command).not.toBeNull();
		const [lsfArgs, deleteArgs] = runPipeline(command!);
		expect(lsfArgs).toContain(":s3:mybucket/myapp/English-Program/");
		expect(deleteArgs).toContain(
			":s3:mybucket/myapp/English-Program/2026-01-01T00-00-00-000Z.sql.gz",
		);
	});

	it("uses the .zip include pattern for web-server backups", () => {
		const command = getKeepLatestNBackupsCommand(
			{
				prefix: "p",
				databaseType: "web-server",
				keepLatestCount: 2,
			} as Parameters<typeof getKeepLatestNBackupsCommand>[0],
			destination,
			"myapp",
		);
		expect(command).toContain('--include "*.zip"');
	});
});
