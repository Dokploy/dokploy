import { db } from "@dokploy/server/db";
import {
	findComposeReplicaOverrides,
	saveComposeReplicaOverride,
} from "@dokploy/server/services/scaling/compose-overrides";
import { setComposeServiceReplicas } from "@dokploy/server/services/scaling/compose-scale";
import {
	type ComposeSnapshot,
	readComposeSnapshot,
	runDockerCli,
	writeSnapshotReplicas,
} from "@dokploy/server/services/scaling/compose-snapshot";
import type { ScalableCompose } from "@dokploy/server/services/scaling/compose-status";
import {
	composeScaleLockKey,
	withDeployLock,
} from "@dokploy/server/services/scaling/scale-lock";
import { ScaleRejectedError } from "@dokploy/server/services/scaling/scale-service";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

const { getRemoteDockerMock } = vi.hoisted(() => ({
	getRemoteDockerMock: vi.fn(),
}));

vi.mock("@dokploy/server/utils/servers/remote-docker", () => ({
	getRemoteDocker: getRemoteDockerMock,
}));

vi.mock(
	"@dokploy/server/services/scaling/compose-snapshot",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-snapshot")
		>()),
		readComposeSnapshot: vi.fn(),
		runDockerCli: vi.fn(),
		writeSnapshotReplicas: vi.fn(),
	}),
);

vi.mock(
	"@dokploy/server/services/scaling/compose-overrides",
	async (importActual) => ({
		...(await importActual<
			typeof import("@dokploy/server/services/scaling/compose-overrides")
		>()),
		findComposeReplicaOverrides: vi.fn(),
		saveComposeReplicaOverride: vi.fn(),
	}),
);

const compose = (
	overrides: Partial<ScalableCompose> = {},
): ScalableCompose => ({
	composeId: "compose-1",
	appName: "shop",
	serverId: null,
	sourceType: "github",
	composePath: "docker-compose.yml",
	composeType: "docker-compose",
	createEnvFile: true,
	command: "",
	composeStatus: "done",
	server: null,
	...overrides,
});

const snapshot = (yaml: string): ComposeSnapshot => ({
	spec: parse(yaml),
	composeType: "docker-compose",
	projectDirectory: "/code",
	files: {
		dir: "/snap",
		compose: "/snap/compose.yml",
		env: "/snap/compose.env",
	},
});

const WEB = snapshot("services:\n  web:\n    image: nginx\n");

const running = (number: number, state = "running") => ({
	Id: `web-${number}`,
	State: state,
	Status: state === "running" ? "Up" : "Exited (0)",
	Labels: { "com.docker.compose.container-number": String(number) },
});

const notFound = () =>
	Object.assign(new Error("no such service"), { statusCode: 404 });

let liveService: {
	ID: string;
	Version: { Index: number };
	Spec: Record<string, unknown> & { Mode: Record<string, unknown> };
	UpdateStatus?: { State: string };
} | null;

const docker = {
	listContainers: vi.fn(),
	listNodes: vi.fn(),
	listTasks: vi.fn(),
	getService: vi.fn(() => ({
		inspect: vi.fn(async () => {
			if (!liveService) throw notFound();
			return structuredClone(liveService);
		}),
		update: vi.fn(
			async ({ _body }: { _body: { Mode: Record<string, unknown> } }) => {
				if (liveService) {
					liveService.Spec.Mode = _body.Mode;
					liveService.Version.Index += 1;
				}
			},
		),
	})),
};

const events: Record<string, unknown>[] = [];

describe("setComposeServiceReplicas", () => {
	beforeEach(() => {
		events.length = 0;
		liveService = null;
		for (const fn of [
			docker.listContainers,
			docker.listNodes,
			docker.listTasks,
		]) {
			fn.mockReset();
		}
		docker.listNodes.mockResolvedValue([
			{
				ID: "n0",
				Description: {
					Hostname: "vm-0",
					Resources: { NanoCPUs: 8e9, MemoryBytes: 16 * 1024 ** 3 },
				},
				Spec: { Role: "manager", Availability: "active" },
				Status: { State: "ready" },
			},
		]);
		docker.listTasks.mockResolvedValue([]);
		getRemoteDockerMock.mockResolvedValue(docker);
		vi.mocked(readComposeSnapshot).mockReset().mockResolvedValue(WEB);
		vi.mocked(runDockerCli).mockReset().mockResolvedValue({
			stdout: "",
			stderr: "",
		});
		vi.mocked(writeSnapshotReplicas).mockReset();
		vi.mocked(findComposeReplicaOverrides).mockReset().mockResolvedValue([]);
		vi.mocked(saveComposeReplicaOverride).mockReset();
		vi.mocked(db.insert).mockReturnValue({
			values: (event: Record<string, unknown>) => {
				events.push(event);
				return { returning: async () => [event] };
			},
		} as never);
	});

	describe("plain compose", () => {
		it("adds containers with compose and keeps the snapshot in step", async () => {
			docker.listContainers.mockResolvedValue([running(1), running(2)]);

			const result = await setComposeServiceReplicas({
				compose: compose(),
				serviceName: "web",
				replicas: 4,
				userId: "user-1",
			});

			expect(result).toEqual({ from: 2, to: 4, applied: true, note: null });
			const args = vi.mocked(runDockerCli).mock.calls[0]?.[2];
			expect(args).toEqual([
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
				"--no-deps",
				"--no-recreate",
				"--no-build",
				"--pull",
				"never",
				"--scale",
				"web=4",
				"web",
			]);
			expect(saveComposeReplicaOverride).toHaveBeenCalledWith({
				composeId: "compose-1",
				serviceName: "web",
				replicas: 4,
			});
			expect(writeSnapshotReplicas).toHaveBeenCalledWith(
				expect.anything(),
				WEB,
				"web",
				4,
			);
			expect(events).toEqual([
				expect.objectContaining({
					composeId: "compose-1",
					serviceName: "web",
					action: "scale_up",
					fromReplicas: 2,
					toReplicas: 4,
				}),
			]);
		});

		it("refuses while a replica is stopped, without saving", async () => {
			docker.listContainers.mockResolvedValue([
				running(1),
				running(2, "exited"),
			]);

			await expect(
				setComposeServiceReplicas({
					compose: compose(),
					serviceName: "web",
					replicas: 3,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "replicas_stopped" });
			expect(saveComposeReplicaOverride).not.toHaveBeenCalled();
			expect(runDockerCli).not.toHaveBeenCalled();
		});

		it.each([
			["idle", /started or deployed/],
			["error", /last deployment failed/],
		] as const)(
			"only saves when the compose is %s",
			async (composeStatus, note) => {
				const result = await setComposeServiceReplicas({
					compose: compose({ composeStatus }),
					serviceName: "web",
					replicas: 3,
					userId: null,
				});

				expect(result.applied).toBe(false);
				expect(result.note).toMatch(note);
				expect(saveComposeReplicaOverride).toHaveBeenCalled();
				expect(runDockerCli).not.toHaveBeenCalled();
				expect(events[0]).toMatchObject({ action: "set" });
			},
		);

		it("only saves before the first deploy wrote a snapshot", async () => {
			vi.mocked(readComposeSnapshot).mockResolvedValue(null);

			const result = await setComposeServiceReplicas({
				compose: compose(),
				serviceName: "web",
				replicas: 2,
				userId: null,
			});

			expect(result.applied).toBe(false);
			expect(result.note).toMatch(/Deploy once/);
			expect(runDockerCli).not.toHaveBeenCalled();
		});

		it("refuses more than one container for a single-instance service", async () => {
			vi.mocked(readComposeSnapshot).mockResolvedValue(
				snapshot(
					'services:\n  web:\n    image: nginx\n    ports: ["8080:80"]\n',
				),
			);

			await expect(
				setComposeServiceReplicas({
					compose: compose(),
					serviceName: "web",
					replicas: 2,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "single_instance" });
		});

		it("records a failed compose run", async () => {
			docker.listContainers.mockResolvedValue([running(1)]);
			vi.mocked(runDockerCli).mockRejectedValue(new Error("image missing"));

			await expect(
				setComposeServiceReplicas({
					compose: compose(),
					serviceName: "web",
					replicas: 2,
					userId: null,
				}),
			).rejects.toThrow("image missing");
			expect(events).toEqual([
				expect.objectContaining({ action: "error", reason: "image missing" }),
			]);
			expect(writeSnapshotReplicas).not.toHaveBeenCalled();
		});
	});

	describe("guards", () => {
		it("refuses composes deployed with a custom command", async () => {
			await expect(
				setComposeServiceReplicas({
					compose: compose({ command: "compose up -d" }),
					serviceName: "web",
					replicas: 2,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "custom_command" });
		});

		it("refuses while a deployment runs", async () => {
			await expect(
				setComposeServiceReplicas({
					compose: compose({ composeStatus: "running" }),
					serviceName: "web",
					replicas: 2,
					userId: null,
				}),
			).rejects.toBeInstanceOf(ScaleRejectedError);

			let release: () => void = () => {};
			const deploy = withDeployLock(
				composeScaleLockKey("compose-1"),
				() => new Promise<void>((resolve) => (release = resolve)),
			);
			await expect(
				setComposeServiceReplicas({
					compose: compose(),
					serviceName: "web",
					replicas: 2,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "deployment_in_progress" });
			release();
			await deploy;
		});
	});

	describe("stack", () => {
		const stack = (overrides: Partial<ScalableCompose> = {}) =>
			compose({ composeType: "stack", ...overrides });

		it("scales the Swarm service without other changes", async () => {
			liveService = {
				ID: "svc-1",
				Version: { Index: 7 },
				Spec: {
					Name: "shop_web",
					Mode: { Replicated: { Replicas: 2 } },
					TaskTemplate: { ForceUpdate: 3 },
				},
			};

			const result = await setComposeServiceReplicas({
				compose: stack(),
				serviceName: "web",
				replicas: 5,
				userId: "user-1",
			});

			expect(docker.getService).toHaveBeenCalledWith("shop_web");
			expect(liveService.Spec.Mode).toEqual({ Replicated: { Replicas: 5 } });
			expect(liveService.Spec.TaskTemplate).toEqual({ ForceUpdate: 3 });
			expect(result).toEqual({ from: 2, to: 5, applied: true, note: null });
			expect(runDockerCli).not.toHaveBeenCalled();
			expect(events.at(-1)).toMatchObject({ action: "scale_up" });
		});

		it("only saves when the stack was removed by Stop", async () => {
			const result = await setComposeServiceReplicas({
				compose: stack(),
				serviceName: "web",
				replicas: 3,
				userId: null,
			});
			expect(result.applied).toBe(false);
			expect(result.note).toMatch(/next deploy/);
		});

		it("scales a stack that still runs although its status is idle, and corrects the status", async () => {
			liveService = {
				ID: "svc-1",
				Version: { Index: 4 },
				Spec: { Name: "shop_web", Mode: { Replicated: { Replicas: 3 } } },
			};
			const where = vi.fn();
			const set = vi.fn(() => ({ where }));
			vi.mocked(db.update).mockReturnValue({ set } as never);

			const result = await setComposeServiceReplicas({
				compose: stack({ composeStatus: "idle" }),
				serviceName: "web",
				replicas: 1,
				userId: null,
			});

			expect(result).toEqual({ from: 3, to: 1, applied: true, note: null });
			expect(liveService.Spec.Mode).toEqual({ Replicated: { Replicas: 1 } });
			expect(set).toHaveBeenCalledWith({ composeStatus: "done" });
		});

		it("only saves for an idle stack that has nothing running", async () => {
			liveService = {
				ID: "svc-1",
				Version: { Index: 4 },
				Spec: { Name: "shop_web", Mode: { Replicated: { Replicas: 0 } } },
			};
			const result = await setComposeServiceReplicas({
				compose: stack({ composeStatus: "idle" }),
				serviceName: "web",
				replicas: 2,
				userId: null,
			});
			expect(result).toMatchObject({ applied: false });
			expect(result.note).toMatch(/not running/);
			expect(liveService.Spec.Mode).toEqual({ Replicated: { Replicas: 0 } });
		});

		it("only saves while a volume backup holds the service at 0", async () => {
			liveService = {
				ID: "svc-1",
				Version: { Index: 1 },
				Spec: { Mode: { Replicated: { Replicas: 0 } } },
			};
			const result = await setComposeServiceReplicas({
				compose: stack(),
				serviceName: "web",
				replicas: 3,
				userId: null,
			});
			expect(result).toMatchObject({ from: 0, applied: false });
			expect(liveService.Spec.Mode).toEqual({ Replicated: { Replicas: 0 } });
		});

		it("refuses during a rollout", async () => {
			liveService = {
				ID: "svc-1",
				Version: { Index: 1 },
				Spec: { Mode: { Replicated: { Replicas: 2 } } },
				UpdateStatus: { State: "updating" },
			};
			await expect(
				setComposeServiceReplicas({
					compose: stack(),
					serviceName: "web",
					replicas: 3,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "rollout_in_progress" });
		});

		it("blocks a scale that does not fit until it is acknowledged", async () => {
			const CPU = 1_000_000_000;
			liveService = {
				ID: "svc-1",
				Version: { Index: 1 },
				Spec: {
					Mode: { Replicated: { Replicas: 1 } },
					TaskTemplate: {
						Resources: { Reservations: { NanoCPUs: CPU } },
					},
				},
			};
			docker.listNodes.mockResolvedValue([
				{
					ID: "n1",
					Description: {
						Hostname: "vm-1",
						Resources: { NanoCPUs: 2 * CPU, MemoryBytes: 4 * 1024 ** 3 },
					},
					Spec: { Role: "manager", Availability: "active" },
					Status: { State: "ready" },
				},
			]);

			await expect(
				setComposeServiceReplicas({
					compose: stack(),
					serviceName: "web",
					replicas: 3,
					userId: null,
				}),
			).rejects.toMatchObject({ reason: "insufficient_capacity" });
			expect(events).toEqual([expect.objectContaining({ action: "blocked" })]);
			expect(saveComposeReplicaOverride).not.toHaveBeenCalled();

			const result = await setComposeServiceReplicas({
				compose: stack(),
				serviceName: "web",
				replicas: 3,
				userId: null,
				acknowledgeWarnings: true,
			});
			expect(result.applied).toBe(true);
			expect(events.at(-1)?.details).toMatchObject({
				capacityShortfallAcknowledged: expect.any(String),
			});
		});
	});
});
