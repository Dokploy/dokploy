import { spawnSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";

const findComposeById = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/constants", async (importActual) => {
	const { tmpdir } = await import("node:os");
	const actual =
		await importActual<typeof import("@dokploy/server/constants")>();
	return {
		...actual,
		paths: (isServer = false) => ({
			...actual.paths(isServer),
			VOLUME_BACKUP_LOCK_PATH: `${tmpdir()}/dokploy-volume-backup-test-lock`,
		}),
	};
});

vi.mock("@dokploy/server/services/compose", () => ({ findComposeById }));

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

interface DockerState {
	serviceContainers?: string;
	volumeContainers?: string;
	services?: string;
	volumeExists?: boolean;
	listingFails?: boolean;
}

const runBackup = async ({
	serviceContainers = "",
	volumeContainers = "",
	services = "",
	volumeExists = true,
	listingFails = false,
}: DockerState) => {
	const command = await backupVolume({
		serviceType: "compose",
		volumeName: "data",
		turnOff: true,
		prefix: "",
		appName: "volume-backup",
		destinationId: "destination",
		serviceName: "db",
		compose: { composeId: "compose", appName: "app", serverId: null },
	} as any);

	const shims = [
		`docker() {
			echo "$*" >&2
			case "$*" in
				"ps -q --filter volume=data") echo "${volumeContainers}" ;;
				"ps -q "*) ${listingFails ? "return 1" : `echo "${serviceContainers}"`} ;;
				"service ls "*) ${listingFails ? "return 1" : `echo "${services}"`} ;;
				"service inspect "*) echo 2 ;;
				"volume inspect "*) return ${volumeExists ? 0 : 1} ;;
			esac
		}`,
		"flock() { :; }",
		"rclone() { :; }",
		"rm() { :; }",
	].join("\n");

	const result = spawnSync("bash", ["-c", `${shims}\n${command}`], {
		encoding: "utf8",
	});

	return {
		...result,
		dockerCalls: result.stderr.trim().split("\n").filter(Boolean),
		uploaded: result.stdout.includes("Upload to S3 done"),
	};
};

const backupRun = expect.stringMatching(/^run --rm /);
const serviceLookup =
	"ps -q --filter label=com.docker.compose.project=app --filter label=com.docker.compose.service=db";
const stackLookup = "service ls --filter name=app_db --format {{.Name}}";

const expectAborted = (result: Awaited<ReturnType<typeof runBackup>>) => {
	expect(result.status).not.toBe(0);
	expect(result.uploaded).toBe(false);
	expect(result.dockerCalls).not.toContainEqual(backupRun);
};

describe("backupVolume turning off a regular compose service", () => {
	beforeEach(() => {
		findComposeById.mockResolvedValue({
			appName: "app",
			composeType: "docker-compose",
		});
	});

	it("backs up without stopping or starting when nothing is running", async () => {
		const result = await runBackup({});

		expect(result.status).toBe(0);
		expect(result.uploaded).toBe(true);
		expect(result.dockerCalls).toEqual([
			serviceLookup,
			"volume inspect data",
			"ps -q --filter volume=data",
			backupRun,
		]);
	});

	it("fails instead of creating the volume when it does not exist", async () => {
		expectAborted(await runBackup({ volumeExists: false }));
	});

	it("fails when the service name matches nothing but the volume is in use", async () => {
		const result = await runBackup({ volumeContainers: "abc" });

		expectAborted(result);
		expect(result.stdout).toContain("still used by running containers");
	});

	it("fails when the running containers cannot be listed", async () => {
		expectAborted(await runBackup({ listingFails: true }));
	});

	it("stops and restarts the running containers around the backup", async () => {
		const result = await runBackup({ serviceContainers: "abc" });

		expect(result.status).toBe(0);
		expect(result.uploaded).toBe(true);
		expect(result.dockerCalls).toEqual([
			serviceLookup,
			"stop abc",
			backupRun,
			"start abc",
		]);
	});
});

describe("backupVolume turning off a stack service", () => {
	beforeEach(() => {
		findComposeById.mockResolvedValue({ appName: "app", composeType: "stack" });
	});

	it("backs up without scaling when the stack was removed", async () => {
		const result = await runBackup({ services: "app_db2" });

		expect(result.status).toBe(0);
		expect(result.uploaded).toBe(true);
		expect(result.dockerCalls).toEqual([
			stackLookup,
			"volume inspect data",
			"ps -q --filter volume=data",
			backupRun,
		]);
	});

	it("fails instead of creating the volume when it does not exist", async () => {
		expectAborted(await runBackup({ volumeExists: false }));
	});

	it("fails when the service name matches nothing but the volume is in use", async () => {
		const result = await runBackup({ volumeContainers: "abc" });

		expectAborted(result);
		expect(result.stdout).toContain("still used by running containers");
	});

	it("fails when the services cannot be listed", async () => {
		expectAborted(await runBackup({ listingFails: true }));
	});

	it("restores the replica count around the backup", async () => {
		const result = await runBackup({ services: "app_db" });

		expect(result.status).toBe(0);
		expect(result.uploaded).toBe(true);
		expect(result.dockerCalls).toEqual([
			stackLookup,
			"service inspect app_db --format {{.Spec.Mode.Replicated.Replicas}}",
			"service update --replicas=0 app_db",
			backupRun,
			"service update --replicas=2 --with-registry-auth app_db",
		]);
	});
});
