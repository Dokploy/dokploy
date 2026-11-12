import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";

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

const runWithTarExit = async (tarExit: number) => {
	const command = await backupVolume({
		serviceType: "compose",
		volumeName: "data",
		turnOff: false,
		prefix: "",
		appName: "volume-backup",
		destinationId: "destination",
		serviceName: "web",
		compose: { appName: "app", serverId: null },
	} as any);

	// Run the container command on the host with tar stubbed to the given exit code
	const shims = [
		`docker() { bash -c "cd() { :; }; tar() { return ${tarExit}; }; \${@: -1}"; }`,
		"rclone() { :; }",
		"rm() { :; }",
	].join("\n");

	return spawnSync("bash", ["-c", `${shims}\n${command}`], {
		encoding: "utf8",
	});
};

describe("backupVolume without turning off the container", () => {
	it("uploads when tar reports files changed while reading", async () => {
		const result = await runWithTarExit(1);

		expect(result.status).toBe(0);
		expect(result.stdout).toContain("Upload to S3 done");
	});

	it("fails without uploading when tar hits a fatal error", async () => {
		const result = await runWithTarExit(2);

		expect(result.status).not.toBe(0);
		expect(result.stdout).not.toContain("Starting upload to S3");
	});
});
