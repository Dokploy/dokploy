import { backupVolume } from "@dokploy/server/utils/volume-backups/backup";
import { describe, expect, test, vi } from "vitest";

vi.mock("@dokploy/server/services/destination", () => ({
	findDestinationById: vi.fn(() =>
		Promise.resolve({
			destinationId: "dest-1",
			accessKey: "ak",
			secretAccessKey: "sk",
			region: "us-east-1",
			endpoint: "https://s3.example.com",
			bucket: "my-bucket",
			provider: "AWS",
			additionalFlags: [],
		}),
	),
}));

vi.mock("@dokploy/server/services/compose", () => ({
	findComposeById: vi.fn(() =>
		Promise.resolve({ appName: "stack-app", composeType: "stack" }),
	),
}));

// Application with "Turn Off Container During Backup" enabled.
const applicationVolumeBackup = {
	serviceType: "application",
	volumeName: "my-volume",
	turnOff: true,
	prefix: "",
	destinationId: "dest-1",
	appName: "vb-app",
	application: { appName: "my-app", serverId: null },
	// biome-ignore lint/suspicious/noExplicitAny: minimal fixture for command builder
} as any;

describe("backupVolume - restart guarantee (#4263)", () => {
	// When "Turn Off Container During Backup" is on, the service is scaled to 0
	// before the backup. If the backup step fails (e.g. the ubuntu image can't be
	// pulled), the service must still be scaled back up — otherwise it stays
	// offline indefinitely.
	test("restarts the application even if the backup step fails", async () => {
		const script = (await backupVolume(applicationVolumeBackup)) as string;

		// The backup failure must be captured rather than aborting the script via
		// `set -e`, so the restart below is always reached.
		expect(script).toContain("set +e");
		expect(script).toMatch(/BACKUP_EXIT=\$\?/);
		// Regression guard: the backup subshell must NOT be the left side of
		// `|| BACKUP_EXIT=$?`. In that tested context bash disables the
		// subshell's own `set -e`, silently swallowing a mid-backup failure.
		expect(script).not.toMatch(/\)\s*\|\|\s*BACKUP_EXIT/);

		const restartIdx = script.indexOf(
			"docker service update --replicas=$ACTUAL_REPLICAS",
		);
		const bailIdx = script.indexOf('exit "$BACKUP_EXIT"');

		expect(restartIdx).toBeGreaterThan(-1);
		expect(bailIdx).toBeGreaterThan(-1);
		// The restart runs BEFORE the script bails out on a failed backup.
		expect(restartIdx).toBeLessThan(bailIdx);
	});

	test("restarts a compose stack service even if the backup step fails", async () => {
		const composeVolumeBackup = {
			serviceType: "compose",
			volumeName: "my-volume",
			turnOff: true,
			prefix: "",
			destinationId: "dest-1",
			appName: "vb-app",
			serviceName: "web",
			compose: { appName: "stack-app", composeId: "c1", serverId: null },
			// biome-ignore lint/suspicious/noExplicitAny: minimal fixture for command builder
		} as any;

		const script = (await backupVolume(composeVolumeBackup)) as string;

		expect(script).toContain("set +e");
		expect(script).toMatch(/BACKUP_EXIT=\$\?/);
		expect(script).not.toMatch(/\)\s*\|\|\s*BACKUP_EXIT/);

		const restartIdx = script.indexOf(
			"docker service update --replicas=$ACTUAL_REPLICAS",
		);
		const bailIdx = script.indexOf('exit "$BACKUP_EXIT"');

		expect(restartIdx).toBeGreaterThan(-1);
		expect(bailIdx).toBeGreaterThan(-1);
		expect(restartIdx).toBeLessThan(bailIdx);
	});
});
