import { spawn, spawnSync } from "node:child_process";
import {
	existsSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const baseDir = mkdtempSync(path.join(tmpdir(), "volume-backup-"));
const dockerLog = path.join(baseDir, "docker.log");
const rcloneLog = path.join(baseDir, "rclone.log");
const lockDir = path.join(baseDir, "volume-backup-lock-app.dir");

vi.mock("@dokploy/server/constants", () => ({
	paths: () => ({
		VOLUME_BACKUPS_PATH: path.join(baseDir, "volume-backups"),
		VOLUME_BACKUP_LOCK_PATH: path.join(baseDir, "volume-backup-lock"),
	}),
}));

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

const { backupVolume } = await import(
	"@dokploy/server/utils/volume-backups/backup"
);

const buildApplicationBackupCommand = () =>
	backupVolume({
		serviceType: "application",
		volumeName: "data",
		turnOff: true,
		prefix: "",
		appName: "volume-backup",
		destinationId: "destination",
		serviceName: null,
		application: { appName: "app", serverId: null },
	} as any);

const dockerShim = (helperAvailable: boolean, archiveCommand = ":") => `
docker() {
	echo "docker $1 $2" >> "${dockerLog}"
	case "$1 $2" in
		"image inspect"|"pull ubuntu") ${helperAvailable ? "return 0" : "return 1"} ;;
		"service inspect") echo 2 ;;
		"run --rm") ${archiveCommand} ;;
	esac
}
rclone() { echo rclone >> "${rcloneLog}"; }`;

const readLines = (file: string) =>
	existsSync(file) ? readFileSync(file, "utf8").trim().split("\n") : [];

const resetLogs = () => {
	rmSync(dockerLog, { force: true });
	rmSync(rcloneLog, { force: true });
	rmSync(lockDir, { recursive: true, force: true });
};

const runApplicationBackup = async (helperAvailable: boolean) => {
	const command = await buildApplicationBackupCommand();
	resetLogs();
	const shims = `${dockerShim(helperAvailable)}\nrm() { :; }`;

	const result = spawnSync("bash", ["-c", `${shims}\n${command}`], {
		encoding: "utf8",
	});
	return { status: result.status, dockerCalls: readLines(dockerLog) };
};

const resolveTool = (tool: string) =>
	spawnSync("sh", ["-c", `command -v ${tool}`], {
		encoding: "utf8",
	}).stdout.trim();

// A PATH with only these tools hides flock, so the lock wrapper takes the mkdir fallback.
const createBinDirWithoutFlock = () => {
	const binDir = mkdtempSync(path.join(tmpdir(), "volume-backup-bin-"));
	for (const tool of ["mkdir", "rm", "sleep"]) {
		symlinkSync(resolveTool(tool), path.join(binDir, tool));
	}
	return binDir;
};

const waitFor = async (condition: () => boolean, timeoutMs = 5000) => {
	const start = Date.now();
	while (!condition()) {
		if (Date.now() - start > timeoutMs) {
			throw new Error("Timed out waiting for the backup to start");
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
};

const runTerminatedApplicationBackup = async () => {
	const command = await buildApplicationBackupCommand();
	resetLogs();
	const binDir = createBinDirWithoutFlock();

	const child = spawn(
		resolveTool("dash"),
		["-c", `${dockerShim(true, "sleep 5")}\n${command}`],
		{
			detached: true,
			env: { ...process.env, PATH: binDir },
			stdio: "ignore",
		},
	);
	const exited = new Promise<number | null>((resolve) =>
		child.on("exit", (code) => resolve(code)),
	);

	await waitFor(() => readLines(dockerLog).includes("docker run --rm"));
	expect(existsSync(lockDir)).toBe(true);
	// Signal the whole process group, as a stopped job runner or a container shutdown would.
	if (child.pid === undefined) {
		throw new Error("The backup shell did not start");
	}
	process.kill(-child.pid, "SIGTERM");

	const status = await exited;
	rmSync(binDir, { recursive: true, force: true });
	return {
		status,
		dockerCalls: readLines(dockerLog),
		uploads: readLines(rcloneLog),
	};
};

describe("backupVolume with turning off the application (#5852)", () => {
	it("checks the helper image before the service is stopped", async () => {
		const result = await runApplicationBackup(true);

		expect(result.status).toBe(0);
		expect(result.dockerCalls).toEqual([
			"docker image inspect",
			"docker service inspect",
			"docker service update",
			"docker run --rm",
			"docker service update",
		]);
	});

	it("fails without stopping the service when the helper image is not available", async () => {
		const result = await runApplicationBackup(false);

		expect(result.status).not.toBe(0);
		expect(result.dockerCalls).toEqual([
			"docker image inspect",
			"docker pull ubuntu",
		]);
	});

	it("restarts the service, skips the upload and releases the lock when terminated under dash", async () => {
		const result = await runTerminatedApplicationBackup();

		expect(result.status).toBe(143);
		expect(result.dockerCalls).toEqual([
			"docker image inspect",
			"docker service inspect",
			"docker service update",
			"docker run --rm",
			"docker service update",
		]);
		expect(result.uploads).toEqual([]);
		expect(existsSync(lockDir)).toBe(false);
	});
});
