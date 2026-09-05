import { spawnSync } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Destination } from "@dokploy/server/services/destination";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Regression coverage for the data-loss bug introduced in ffc2d593e, where
 * `restoreWebServerBackup` ran `rm -rf "${BASE_PATH}/"*` (wiping the live Dokploy
 * data directory) BEFORE verifying the replacement `filesystem/` tree existed
 * or was non-empty. A backup with a missing or empty `filesystem/` then left
 * BASE_PATH permanently empty.
 *
 * Two complementary layers:
 *  - Orchestration tests mock execAsync to assert the TS control-flow ordering
 *    (preflight before wipe, staging before wipe, no wipe on failure).
 *  - Shell-semantics tests reproduce the exact /bin/sh command sequence against
 *    a real filesystem to guard the glob/nullglob and `ls -A` behaviors the mock
 *    layer cannot see.
 */

const BASE_PATH = "/tmp/__dokploy_ws_base__";
const TEMP_DIR = "/tmp/__dokploy_ws_tmp__";

const mocks = vi.hoisted(() => ({
	execAsync: vi.fn(),
	mkdtemp: vi.fn(),
	getS3Credentials: vi.fn(),
}));

vi.mock("@dokploy/server/constants", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		IS_CLOUD: false,
		paths: () => ({ ...actual.paths(), BASE_PATH }),
	};
});

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: mocks.execAsync,
}));

vi.mock("@dokploy/server/utils/backups/utils", () => ({
	getS3Credentials: mocks.getS3Credentials,
}));

vi.mock("node:fs/promises", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs/promises")>();
	return { ...actual, mkdtemp: mocks.mkdtemp };
});

import { restoreWebServerBackup } from "@dokploy/server/utils/restore/web-server";

const destination = { bucket: "test-bucket" } as unknown as Destination;
const backupFile = "webserver-backup-20250101-000000.zip";
const emit = (log: string) => {
	void log;
};

// --- Command matchers (operate on the exact strings the function issues) ---
const commands = () =>
	mocks.execAsync.mock.calls.map((call) => call[0]) as string[];
const isPreflight = (cmd: string) =>
	cmd.startsWith("ls -A") && cmd.includes("filesystem");
const isStagingCopy = (cmd: string) => cmd.startsWith("cp -rp");
const isWipe = (cmd: string) => cmd === `rm -rf "${BASE_PATH}/"*`;
const isStagingMove = (cmd: string) => cmd.startsWith("mv ");
const isStagingSetup = (cmd: string) => cmd.includes("restore-staging");
const isStagingCleanup = (cmd: string) =>
	cmd.startsWith("rm -rf") && cmd.includes("restore-staging");
const isTempCleanup = (cmd: string) => cmd === `rm -rf ${TEMP_DIR}`;

function configureExec(opts: { fsListing: string; stagingFails?: boolean }) {
	mocks.execAsync.mockImplementation(async (command: string) => {
		if (isPreflight(command)) return { stdout: opts.fsListing, stderr: "" };
		if (isStagingCopy(command)) {
			if (opts.stagingFails) throw new Error("staging copy failed (disk full)");
			return { stdout: "", stderr: "" };
		}
		if (command.includes("docker ps") && command.includes("dokploy-postgres"))
			return { stdout: "abc123\n", stderr: "" };
		if (command.includes("database.sql.gz")) return { stdout: "", stderr: "" };
		if (command.includes("database.sql"))
			return { stdout: `${TEMP_DIR}/database.sql`, stderr: "" };
		return { stdout: "", stderr: "" };
	});
}

describe("restoreWebServerBackup: wipe ordering (data-loss regression ffc2d593e)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.mkdtemp.mockResolvedValue(TEMP_DIR);
		mocks.getS3Credentials.mockReturnValue([]);
	});

	it("refuses to wipe BASE_PATH when the archive has no filesystem/ entry", async () => {
		configureExec({ fsListing: "" });

		await expect(
			restoreWebServerBackup(destination, backupFile, emit),
		).rejects.toThrow(/filesystem\/ tree/);

		const cmds = commands();
		expect(cmds.some(isPreflight)).toBe(true);
		expect(cmds.some(isWipe)).toBe(false);
		// Nothing staging-related ran (preflight aborted before staging setup).
		expect(cmds.some(isStagingSetup)).toBe(false);
	});

	it("refuses to wipe BASE_PATH when filesystem/ is empty", async () => {
		configureExec({ fsListing: "" });

		await expect(
			restoreWebServerBackup(destination, backupFile, emit),
		).rejects.toThrow(/filesystem\/ tree/);

		const cmds = commands();
		expect(cmds.some(isWipe)).toBe(false);
		expect(cmds.some(isStagingSetup)).toBe(false);
	});

	it("stages the backup before wiping BASE_PATH, then moves it into place", async () => {
		configureExec({ fsListing: "logs\napplications\ncompose\n" });

		await restoreWebServerBackup(destination, backupFile, emit);

		const cmds = commands();
		expect(cmds.some(isWipe)).toBe(true);
		expect(cmds.some(isStagingMove)).toBe(true);

		const preflightIdx = cmds.findIndex(isPreflight);
		const stagingIdx = cmds.findIndex(isStagingCopy);
		const wipeIdx = cmds.findIndex(isWipe);
		const moveIdx = cmds.findIndex(isStagingMove);
		expect(preflightIdx).toBeGreaterThanOrEqual(0);
		expect(stagingIdx).toBeGreaterThan(preflightIdx);
		expect(wipeIdx).toBeGreaterThan(stagingIdx);
		expect(moveIdx).toBeGreaterThan(wipeIdx);

		// Staging dir + temp dir are cleaned up afterwards (finally blocks).
		expect(cmds.some(isStagingCleanup)).toBe(true);
		expect(cmds.some(isTempCleanup)).toBe(true);
	});

	it("does not wipe BASE_PATH when the staging copy fails", async () => {
		configureExec({ fsListing: "logs\napplications\n", stagingFails: true });

		await expect(
			restoreWebServerBackup(destination, backupFile, emit),
		).rejects.toThrow(/disk full/);

		const cmds = commands();
		expect(cmds.some(isPreflight)).toBe(true);
		expect(cmds.some(isStagingCopy)).toBe(true);
		expect(cmds.some(isWipe)).toBe(false);
		// Cleanup still runs despite the failure.
		expect(cmds.some(isStagingCleanup)).toBe(true);
		expect(cmds.some(isTempCleanup)).toBe(true);
	});
});

/**
 * Real-filesystem reproduction of the exact /bin/sh filesystem-restore command
 * sequence from packages/server/src/utils/restore/web-server.ts. The production
 * base image runs /bin/sh = dash (nullglob off), so the glob/`ls -A` semantics
 * here match what operators get. NB: this mirrors the source commands directly;
 * if the source changes, update both together.
 */
describe("restore filesystem shell semantics (real /bin/sh)", () => {
	const run = (cmd: string) =>
		spawnSync("sh", ["-c", cmd], { encoding: "utf8" });

	let base: string;
	let temp: string;

	beforeEach(() => {
		base = mkdtempSync(join(tmpdir(), "dokploy-ws-base-"));
		temp = mkdtempSync(join(tmpdir(), "dokploy-ws-tmp-"));
		writeFileSync(join(base, "keep.txt"), "keep");
	});
	afterEach(() => {
		rmSync(base, { recursive: true, force: true });
		rmSync(temp, { recursive: true, force: true });
		rmSync(`${base}.restore-staging`, { recursive: true, force: true });
	});

	// Mirrors the FIXED filesystem-restore block in web-server.ts.
	function restoreFilesystem() {
		const { stdout: listing } = run(
			`ls -A "${temp}/filesystem" 2>/dev/null || true`,
		);
		if (!listing.trim())
			throw new Error(
				"Backup archive has no filesystem/ tree (missing or empty); refusing to wipe BASE_PATH",
			);
		const staging = `${base}.restore-staging`;
		run(`rm -rf '${staging}'`);
		run(`mkdir -p '${staging}'`);
		if (run(`cp -rp "${temp}/filesystem/"* '${staging}'/`).status !== 0) {
			run(`rm -rf '${staging}'`);
			throw new Error("staging copy failed");
		}
		run(`rm -rf "${base}/"*`);
		run(`mkdir -p "${base}"`);
		run(`mv '${staging}'/* "${base}/"`);
		run(`rm -rf '${staging}'`);
	}

	it("preserves BASE_PATH when the archive has no filesystem/ entry", () => {
		expect(() => restoreFilesystem()).toThrow(/refusing to wipe BASE_PATH/);
		expect(readdirSync(base)).toEqual(["keep.txt"]);
		expect(existsSync(`${base}.restore-staging`)).toBe(false);
	});

	it("preserves BASE_PATH when filesystem/ is empty", () => {
		mkdirSync(join(temp, "filesystem"));
		expect(() => restoreFilesystem()).toThrow(/refusing to wipe BASE_PATH/);
		expect(readdirSync(base)).toEqual(["keep.txt"]);
		expect(existsSync(`${base}.restore-staging`)).toBe(false);
	});

	it("preserves BASE_PATH when the only filesystem entry is a dotfile (glob miss)", () => {
		mkdirSync(join(temp, "filesystem"));
		writeFileSync(join(temp, "filesystem", ".hidden"), "x");
		// `ls -A` sees the dotfile (preflight passes), but `cp filesystem/*`
		// misses it (nullglob off -> literal glob -> cp fails), so the wipe
		// must NOT run.
		expect(() => restoreFilesystem()).toThrow(/staging copy failed/);
		expect(readdirSync(base)).toEqual(["keep.txt"]);
		expect(existsSync(`${base}.restore-staging`)).toBe(false);
	});

	it("replaces BASE_PATH contents with a well-formed backup", () => {
		mkdirSync(join(temp, "filesystem", "logs"), { recursive: true });
		writeFileSync(join(temp, "filesystem", "logs", "app.log"), "log");
		writeFileSync(join(temp, "filesystem", "marker.txt"), "restored");
		restoreFilesystem();
		expect(readdirSync(base).sort()).toEqual(["logs", "marker.txt"]);
		expect(readFileSync(join(base, "marker.txt"), "utf8")).toBe("restored");
	});
});
