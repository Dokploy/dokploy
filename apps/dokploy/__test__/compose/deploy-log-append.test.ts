import { randomBytes } from "node:crypto";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { appendFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendDeployLogsIfSplit } from "@dokploy/server/services/compose";
import * as execProcess from "@dokploy/server/utils/process/execAsync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Linux MAX_ARG_STRLEN: sshd runs each command as a single `sh -c` argument.
const MAX_ARG_STRLEN = 128 * 1024;

// "Remote" servers are the local filesystem; remote exec enforces the Linux
// per-argument limit that broke the old `echo "<base64>" | base64 -d` copy.
vi.mock("@dokploy/server/utils/process/execAsync", async (importOriginal) => {
	const actual =
		await importOriginal<
			typeof import("@dokploy/server/utils/process/execAsync")
		>();
	return {
		...actual,
		execAsyncRemote: vi.fn(async (_serverId: string, command: string) => {
			if (command.length > MAX_ARG_STRLEN) {
				throw new Error("Argument list too long");
			}
			return actual.execAsync(command);
		}),
		readFileRemote: vi.fn(async (_serverId: string, path: string) =>
			existsSync(path) ? readFile(path) : null,
		),
		appendFileRemote: vi.fn((_serverId: string, path: string, content) =>
			appendFile(path, content),
		),
	};
});

vi.mock("@dokploy/server/db", () => ({ db: {} }));

describe("appendDeployLogsIfSplit", () => {
	let dir: string;
	let mainLog: string;
	let deployLog: string;

	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "deploy-log-"));
		mainLog = join(dir, "main.log");
		deployLog = `${mainLog}.deploy`;
		writeFileSync(mainLog, "build output\n");
	});

	afterEach(() => {
		rmSync(dir, { recursive: true, force: true });
		vi.clearAllMocks();
	});

	it("copies a deploy log far larger than one shell argument", async () => {
		const lines = Array.from(
			{ length: 20_000 },
			(_, i) => `#${i} ${randomBytes(24).toString("hex")} ✅`,
		);
		const content = `${lines.join("\n")}\n`;
		expect(content.length).toBeGreaterThan(MAX_ARG_STRLEN * 8);
		writeFileSync(deployLog, content);

		await appendDeployLogsIfSplit("deploy-1", deployLog, "build-1", mainLog);

		expect(readFileSync(mainLog, "utf8")).toBe(
			`build output\n\n=== Deploy phase ===\n${content}`,
		);
		expect(existsSync(deployLog)).toBe(false);
	});

	it("copies from a local deploy target to a remote log host", async () => {
		writeFileSync(deployLog, "container started\n");

		await appendDeployLogsIfSplit(null, deployLog, "build-1", mainLog);

		expect(readFileSync(mainLog, "utf8")).toBe(
			"build output\n\n=== Deploy phase ===\ncontainer started\n",
		);
		expect(existsSync(deployLog)).toBe(false);
	});

	it("does nothing when deploy and log host are the same", async () => {
		writeFileSync(deployLog, "x\n");

		await appendDeployLogsIfSplit("srv", deployLog, "srv", mainLog);

		expect(readFileSync(mainLog, "utf8")).toBe("build output\n");
		expect(existsSync(deployLog)).toBe(true);
	});

	it("skips the section when there is no deploy log", async () => {
		await appendDeployLogsIfSplit("deploy-1", deployLog, "build-1", mainLog);

		expect(readFileSync(mainLog, "utf8")).toBe("build output\n");
	});

	it("never throws and leaves a note when the copy fails", async () => {
		writeFileSync(deployLog, "container started\n");
		vi.mocked(execProcess.appendFileRemote).mockRejectedValueOnce(
			new Error("SFTP session failed: boom"),
		);

		await expect(
			appendDeployLogsIfSplit("deploy-1", deployLog, "build-1", mainLog),
		).resolves.toBeUndefined();

		const main = readFileSync(mainLog, "utf8");
		expect(main).toContain("Could not copy the deploy-phase log");
		expect(main).toContain("SFTP session failed: boom");
		expect(existsSync(deployLog)).toBe(true);
	});

	it("never throws when even the note cannot be written", async () => {
		writeFileSync(deployLog, "container started\n");
		vi.mocked(execProcess.appendFileRemote).mockRejectedValue(
			new Error("SSH connection error"),
		);

		await expect(
			appendDeployLogsIfSplit("deploy-1", deployLog, "build-1", mainLog),
		).resolves.toBeUndefined();
	});
});
