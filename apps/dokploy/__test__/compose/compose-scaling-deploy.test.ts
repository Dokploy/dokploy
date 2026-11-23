import { db } from "@dokploy/server/db";
import { startCompose, stopCompose } from "@dokploy/server/services/compose";
import {
	readComposeSnapshot,
	runDockerCli,
} from "@dokploy/server/services/scaling/compose-snapshot";
import { scaleService } from "@dokploy/server/services/scaling/scale-service";
import { getScalingDocker } from "@dokploy/server/services/scaling/status";
import { getBuildComposeCommand } from "@dokploy/server/utils/builders/compose";
import { renderDomainsToCompose } from "@dokploy/server/utils/docker/domain";
import { execAsync } from "@dokploy/server/utils/process/execAsync";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

vi.mock("@dokploy/server/services/scaling/status", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/services/scaling/status")
	>()),
	getScalingDocker: vi.fn(),
}));

vi.mock(
	"@dokploy/server/services/scaling/scale-service",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/scale-service")
		>()),
		scaleService: vi.fn().mockResolvedValue({ from: 1, to: 0, changed: true }),
	}),
);

vi.mock(
	"@dokploy/server/services/scaling/compose-status",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-status")
		>()),
		invalidateComposeScalingStatus: vi.fn(),
	}),
);

vi.mock("@dokploy/server/utils/docker/domain", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/utils/docker/domain")
	>()),
	renderDomainsToCompose: vi.fn().mockResolvedValue({ command: "", spec: null }),
}));

vi.mock(
	"@dokploy/server/services/scaling/compose-snapshot",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-snapshot")
		>()),
		readComposeSnapshot: vi.fn(),
		runDockerCli: vi.fn(),
	}),
);

vi.mock("@dokploy/server/utils/process/execAsync", async (importActual) => ({
	...(await importActual<
		typeof import("@dokploy/server/utils/process/execAsync")
	>()),
	execAsync: vi.fn().mockResolvedValue({ stdout: "", stderr: "" }),
}));

const baseCompose = {
	composeId: "compose-1",
	appName: "shop",
	name: "Shop",
	sourceType: "raw",
	command: "",
	composePath: "docker-compose.yml",
	composeType: "docker-compose",
	createEnvFile: true,
	isolatedDeployment: false,
	randomize: false,
	suffix: "",
	serverId: null,
	env: "",
	mounts: [],
	domains: [],
	environment: { project: { env: "" }, env: "" },
};

describe("deploying with replica overrides", () => {
	it("passes overrides to the compose rewrite and snapshots after success", async () => {
		const overrides = [{ serviceName: "web", replicas: 3 }];
		const command = await getBuildComposeCommand(
			baseCompose as unknown as Parameters<typeof getBuildComposeCommand>[0],
			overrides,
		);

		expect(renderDomainsToCompose).toHaveBeenCalledWith(
			expect.objectContaining({ appName: "shop" }),
			[],
			overrides,
		);
		const deployAt = command.indexOf("compose -p shop");
		const snapshotAt = command.indexOf(".dokploy");
		const successAt = command.indexOf("Docker Compose Deployed");
		expect(deployAt).toBeGreaterThan(-1);
		expect(snapshotAt).toBeGreaterThan(deployAt);
		expect(successAt).toBeGreaterThan(snapshotAt);
		expect(command).not.toContain("dokploy-vip.yml");
	});

	it("writes the shared Traefik transport before deploying a stack with domains", async () => {
		const stack = (domains: { enabled: boolean }[]) =>
			getBuildComposeCommand({
				...baseCompose,
				composeType: "stack",
				domains,
			} as unknown as Parameters<typeof getBuildComposeCommand>[0]);

		const command = await stack([{ enabled: true }]);
		const transportAt = command.indexOf("dokploy-vip.yml");
		expect(transportAt).toBeGreaterThan(-1);
		expect(transportAt).toBeLessThan(command.lastIndexOf("stack deploy"));
		expect(await stack([{ enabled: false }])).not.toContain("dokploy-vip.yml");
	});
});

describe("startCompose", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockClear();
		vi.mocked(runDockerCli).mockReset();
		vi.mocked(readComposeSnapshot).mockReset();
		vi.mocked(db.query.compose.findFirst).mockResolvedValue(
			baseCompose as never,
		);
	});

	it("starts from the snapshot of the last deploy when there is one", async () => {
		const snapshot = {
			spec: parse("services:\n  web:\n    image: nginx\n"),
			composeType: "docker-compose" as const,
			projectDirectory: "/code",
			files: {
				dir: "/snap",
				compose: "/snap/compose.yml",
				env: "/snap/compose.env",
			},
		};
		vi.mocked(readComposeSnapshot).mockResolvedValue(snapshot);

		await startCompose("compose-1");

		expect(runDockerCli).toHaveBeenCalledWith(
			expect.objectContaining({ appName: "shop" }),
			snapshot,
			[
				"compose",
				"-p",
				"shop",
				"--project-directory",
				"/code",
				"-f",
				"/snap/compose.yml",
				"--env-file",
				"/snap/compose.env",
				"up",
				"-d",
			],
		);
		expect(execAsync).not.toHaveBeenCalled();
	});

	it("deploys a stopped stack again from its snapshot, from the deployed file's folder", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...baseCompose,
			composeType: "stack",
			composePath: "deploy/stack.yml",
			sourceType: "github",
			env: "TAG=1.2",
		} as never);
		vi.mocked(readComposeSnapshot).mockResolvedValue({
			spec: parse("services:\n  web:\n    image: nginx\n"),
			composeType: "stack",
			projectDirectory: "/etc/dokploy/compose/shop/code/deploy",
			files: {
				dir: "/snap",
				compose: "/snap/compose.yml",
				env: "/snap/compose.env",
			},
		});

		await startCompose("compose-1");

		const command = vi.mocked(execAsync).mock.calls[0]?.[0] ?? "";
		expect(command).toMatch(/^cd .*shop.{1,2}code.{1,2}deploy'?$/m);
		expect(command).toContain(
			"TAG=1.2 docker stack deploy -c - shop --prune --with-registry-auth < /snap/compose.yml",
		);
		expect(runDockerCli).not.toHaveBeenCalled();
		expect(db.update).toHaveBeenCalled();
	});

	it("refuses to start a stack that has no stack snapshot", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...baseCompose,
			composeType: "stack",
		} as never);
		vi.mocked(readComposeSnapshot).mockResolvedValue(null);

		await expect(startCompose("compose-1")).rejects.toThrow(
			"no saved deployment to start from",
		);
		expect(execAsync).not.toHaveBeenCalled();
	});

	it("falls back to the code folder without a snapshot", async () => {
		vi.mocked(readComposeSnapshot).mockResolvedValue(null);

		await startCompose("compose-1");

		expect(runDockerCli).not.toHaveBeenCalled();
		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker compose -p shop"),
		);
	});
});

describe("stopCompose", () => {
	beforeEach(() => {
		vi.mocked(execAsync).mockClear();
		vi.mocked(runDockerCli).mockReset();
		vi.mocked(readComposeSnapshot).mockReset();
		vi.mocked(scaleService).mockClear();
		vi.mocked(getScalingDocker).mockReset();
		vi.mocked(db.query.compose.findFirst).mockResolvedValue(
			baseCompose as never,
		);
	});

	it("stops a compose using snapshot when available, never calling down or deleting containers", async () => {
		const snapshot = {
			spec: parse("services:\n  web:\n    image: nginx\n"),
			composeType: "docker-compose" as const,
			projectDirectory: "/code",
			files: {
				dir: "/snap",
				compose: "/snap/compose.yml",
				env: "/snap/compose.env",
			},
		};
		vi.mocked(readComposeSnapshot).mockResolvedValue(snapshot);

		await stopCompose("compose-1");

		expect(runDockerCli).toHaveBeenCalledWith(
			expect.objectContaining({ appName: "shop" }),
			snapshot,
			[
				"compose",
				"-p",
				"shop",
				"--project-directory",
				"/code",
				"-f",
				"/snap/compose.yml",
				"--env-file",
				"/snap/compose.env",
				"stop",
			],
		);
		expect(execAsync).not.toHaveBeenCalled();
		expect(db.update).toHaveBeenCalled();
	});

	it("falls back to docker compose stop in code directory when snapshot is not available", async () => {
		vi.mocked(readComposeSnapshot).mockResolvedValue(null);

		await stopCompose("compose-1");

		expect(runDockerCli).not.toHaveBeenCalled();
		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker compose -p shop -f docker-compose.yml stop"),
			expect.objectContaining({
				cwd: expect.stringContaining("code"),
			}),
		);
		// Verify down was never called
		const allCalls = vi.mocked(execAsync).mock.calls.map((c) => c[0]);
		expect(allCalls.some((cmd) => cmd.includes("down"))).toBe(false);
	});

	it("stops a stack by scaling replicated services to 0 instead of calling docker stack rm", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...baseCompose,
			composeType: "stack",
		} as never);

		const stopped = [
			{
				ID: "svc1",
				Spec: { Name: "shop_web", Mode: { Replicated: { Replicas: 0 } } },
			},
			{
				ID: "svc2",
				Spec: { Name: "shop_api", Mode: { Replicated: { Replicas: 0 } } },
			},
		];
		const mockDocker = {
			listServices: vi
				.fn()
				.mockResolvedValueOnce([
					{
						ID: "svc1",
						Spec: {
							Name: "shop_web",
							Mode: { Replicated: { Replicas: 2 } },
						},
					},
					{
						ID: "svc2",
						Spec: {
							Name: "shop_api",
							Mode: { Replicated: { Replicas: 1 } },
						},
					},
				])
				.mockResolvedValue(stopped),
		};
		vi.mocked(getScalingDocker).mockResolvedValue(mockDocker as never);

		await stopCompose("compose-1");

		expect(scaleService).toHaveBeenCalledTimes(2);
		expect(scaleService).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceName: "shop_web",
				replicas: 0,
				allowDuringRollout: true,
			}),
		);
		expect(execAsync).not.toHaveBeenCalled();
		expect(scaleService).toHaveBeenCalledWith(
			expect.objectContaining({
				serviceName: "shop_api",
				replicas: 0,
			}),
		);
		// Crucially, it must NEVER call docker stack rm
		expect(execAsync).not.toHaveBeenCalledWith(
			expect.stringContaining("docker stack rm"),
		);
	});

	it("falls back to the CLI when a service is still scaled up afterwards", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...baseCompose,
			composeType: "stack",
		} as never);
		const running = [
			{
				ID: "svc1",
				Spec: { Name: "shop_web", Mode: { Replicated: { Replicas: 2 } } },
			},
		];
		vi.mocked(getScalingDocker).mockResolvedValue({
			listServices: vi.fn().mockResolvedValue(running),
		} as never);

		await stopCompose("compose-1");

		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker service scale -d"),
		);
	});

	it("marks the compose as errored when neither path can stop the stack", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...baseCompose,
			composeType: "stack",
		} as never);
		vi.mocked(getScalingDocker).mockRejectedValue(new Error("no docker"));
		vi.mocked(execAsync).mockRejectedValueOnce(new Error("scale failed"));

		await expect(stopCompose("compose-1")).rejects.toThrow("scale failed");
	});

	it("falls back to cli scale command when docker client fails for stack", async () => {
		vi.mocked(db.query.compose.findFirst).mockResolvedValue({
			...baseCompose,
			composeType: "stack",
		} as never);

		vi.mocked(getScalingDocker).mockRejectedValue(new Error("Docker daemon unavailable"));

		await stopCompose("compose-1");

		expect(execAsync).toHaveBeenCalledWith(
			expect.stringContaining("docker service scale -d"),
		);
		expect(execAsync).not.toHaveBeenCalledWith(
			expect.stringContaining("docker stack rm"),
		);
	});
});
