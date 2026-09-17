import { execSync } from "node:child_process";
import { docker } from "@dokploy/server/constants";
import { setupMonitoring } from "@dokploy/server/setup/monitoring-setup";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const REAL_TEST_TIMEOUT = 120000;
const SERVICE_NAME = "dokploy-monitoring";
const TEST_IMAGE = "busybox:latest";

// Mock ONLY db-backed lookups and remote I/O. Dockerode stays real and talks to
// the local daemon, so the legacy-container cleanup is exercised for real.
vi.mock("@dokploy/server/services/server", () => ({
	findServerById: vi.fn().mockResolvedValue({
		serverId: "test-server",
		serverType: "deploy",
		sshKeyId: null, // -> getRemoteDocker returns the local docker instance
		metricsConfig: {
			server: {
				type: "Remote",
				port: 4500,
				token: "test-token",
				urlCallback: "http://localhost/callback",
				cronJob: "0 0 * * *",
				retentionDays: 2,
				refreshRate: 60,
				thresholds: { cpu: 0, memory: 0 },
			},
			containers: { refreshRate: 60, services: { include: [], exclude: [] } },
		},
	}),
}));

vi.mock("@dokploy/server/services/settings", () => ({
	getDokployImageTag: vi.fn(() => "latest"),
}));

vi.mock("@dokploy/server/utils/docker/utils", () => ({
	pullImage: vi.fn().mockResolvedValue(undefined),
	pullRemoteImage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@dokploy/server/utils/process/execAsync", () => ({
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
	execAsyncRemote: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

const containerExists = async (name: string) => {
	try {
		await docker.getContainer(name).inspect();
		return true;
	} catch (error: any) {
		if (error.statusCode === 404) return false;
		throw error;
	}
};

const serviceExists = async (name: string) => {
	try {
		await docker.getService(name).inspect();
		return true;
	} catch (error: any) {
		if (error.statusCode === 404) return false;
		throw error;
	}
};

// Swarm keeps converging a service for a bit after it's created (scheduling
// tasks, resolving endpoints), which bumps Version.Index on its own. Calling
// setupMonitoring again before that settles races that internal bump, so wait
// for two consecutive reads to agree before treating the service as stable.
const waitForServiceConvergence = async (name: string, timeoutMs = 5000) => {
	const deadline = Date.now() + timeoutMs;
	let lastIndex: string | null = null;
	while (Date.now() < deadline) {
		const inspect = await docker.getService(name).inspect();
		if (inspect.Version.Index === lastIndex) return;
		lastIndex = inspect.Version.Index;
		await new Promise((resolve) => setTimeout(resolve, 50));
	}
};

const swarmTaskNames = async () => {
	const list = await docker.listContainers({ all: true });
	return list
		.flatMap((c) => c.Names.map((n) => n.replace(/^\//, "")))
		.filter((n) => n.startsWith(`${SERVICE_NAME}.`));
};

const cleanup = async () => {
	try {
		await docker.getService(SERVICE_NAME).remove();
	} catch {}
	try {
		await docker.getContainer(SERVICE_NAME).remove({ force: true });
	} catch {}
	for (const name of await swarmTaskNames()) {
		try {
			await docker.getContainer(name).remove({ force: true });
		} catch {}
	}
};

// Recreates the pre-v0.30.0 standalone agent stuck in a crash loop.
const createLegacyZombie = async () => {
	const container = await docker.createContainer({
		name: SERVICE_NAME,
		Image: TEST_IMAGE,
		Cmd: [
			"sh",
			"-c",
			"echo 'Error starting metrics cleanup system: empty spec string'; exit 1",
		],
		HostConfig: { RestartPolicy: { Name: "always" }, NetworkMode: "host" },
	});
	await container.start();
};

const pullTestImage = async () => {
	try {
		await docker.getImage(TEST_IMAGE).inspect();
		return;
	} catch {}
	await new Promise<void>((resolve, reject) =>
		docker.pull(TEST_IMAGE, (err: any, stream: any) =>
			err
				? reject(err)
				: docker.modem.followProgress(stream, (e: any) =>
						e ? reject(e) : resolve(),
					),
		),
	);
};

// The code under test hardcodes the production name, so this suite cannot
// namespace its fixtures. Skip rather than wipe a real agent on a Dokploy host.
const hasRealMonitoring = () => {
	const query = (cmd: string) => {
		try {
			return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
				.toString()
				.trim();
		} catch {
			return "";
		}
	};

	return (
		query(
			`docker service ls --filter name=${SERVICE_NAME} --format '{{.Name}}'`,
		) !== "" ||
		query(
			`docker ps -a --filter name=^${SERVICE_NAME}$ --format '{{.Names}}'`,
		) !== ""
	);
};

const hasDocker = () => {
	try {
		execSync("docker info", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
};

describe.skipIf(!hasDocker() || hasRealMonitoring() || !process.env.CI)(
	"setupMonitoring - legacy container cleanup (real docker)",
	() => {
		beforeEach(async () => {
			await pullTestImage();
			await cleanup();
		}, REAL_TEST_TIMEOUT);

		afterAll(async () => {
			await cleanup();
		}, REAL_TEST_TIMEOUT);

		it(
			"removes the legacy standalone container left behind by the swarm migration",
			async () => {
				await createLegacyZombie();
				expect(await containerExists(SERVICE_NAME)).toBe(true);

				await setupMonitoring("test-server");

				expect(await containerExists(SERVICE_NAME)).toBe(false);
				expect(await serviceExists(SERVICE_NAME)).toBe(true);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"removes the legacy container without touching swarm tasks, which are named dokploy-monitoring.<slot>.<id>",
			async () => {
				const taskName = `${SERVICE_NAME}.1.qh3ldvg2h9x0test`;
				const task = await docker.createContainer({
					name: taskName,
					Image: TEST_IMAGE,
					Cmd: ["sleep", "3600"],
				});
				await task.start();
				await createLegacyZombie();

				await setupMonitoring("test-server");

				expect(await containerExists(SERVICE_NAME)).toBe(false);
				expect(await containerExists(taskName)).toBe(true);
				const inspect = await docker.getContainer(taskName).inspect();
				expect(inspect.State.Running).toBe(true);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"is idempotent when no legacy container exists",
			async () => {
				expect(await containerExists(SERVICE_NAME)).toBe(false);

				await expect(setupMonitoring("test-server")).resolves.not.toThrow();
				await waitForServiceConvergence(SERVICE_NAME);
				await expect(setupMonitoring("test-server")).resolves.not.toThrow();

				expect(await serviceExists(SERVICE_NAME)).toBe(true);
			},
			REAL_TEST_TIMEOUT,
		);

		it(
			"deploys the service even when removing the legacy container fails",
			async () => {
				const failingDocker = {
					getContainer: () => ({
						remove: async () => {
							const error: any = new Error("device or resource busy");
							error.statusCode = 500;
							throw error;
						},
					}),
					getService: docker.getService.bind(docker),
					createService: docker.createService.bind(docker),
				};

				const remoteDocker = await import(
					"@dokploy/server/utils/servers/remote-docker"
				);
				const spy = vi
					.spyOn(remoteDocker, "getRemoteDocker")
					.mockResolvedValue(failingDocker as any);

				try {
					await expect(setupMonitoring("test-server")).resolves.not.toThrow();
					expect(spy).toHaveBeenCalled(); // guards against the spy silently not intercepting
					expect(await serviceExists(SERVICE_NAME)).toBe(true);
				} finally {
					spy.mockRestore();
				}
			},
			REAL_TEST_TIMEOUT,
		);
	},
);
