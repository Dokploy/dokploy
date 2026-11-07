import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

const baseDir = mkdtempSync(path.join(tmpdir(), "volume-backup-"));

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

const runApplicationBackup = async (helperAvailable: boolean) => {
	const command = await backupVolume({
		serviceType: "application",
		volumeName: "data",
		turnOff: true,
		prefix: "",
		appName: "volume-backup",
		destinationId: "destination",
		serviceName: null,
		application: { appName: "app", serverId: null },
	} as any);

	const dockerLog = path.join(baseDir, "docker.log");
	rmSync(dockerLog, { force: true });
	const shims = [
		`docker() {
			echo "docker $1 $2" >> "${dockerLog}"
			case "$1 $2" in
				"image inspect"|"pull ubuntu") ${helperAvailable ? "return 0" : "return 1"} ;;
				"service inspect") echo 2 ;;
			esac
		}`,
		"rclone() { :; }",
		"rm() { :; }",
	].join("\n");

	const result = spawnSync("bash", ["-c", `${shims}\n${command}`], {
		encoding: "utf8",
	});
	return {
		status: result.status,
		dockerCalls: readFileSync(dockerLog, "utf8").trim().split("\n"),
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
});
