import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { docker } from "@dokploy/server/constants";
import { scaleService } from "@dokploy/server/services/scaling/scale-service";
import { waitForSwarmServiceConvergence } from "@dokploy/server/utils/docker/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REAL_TEST_TIMEOUT, runRealSwarmTests } from "./real-swarm";

const execFileAsync = promisify(execFile);

const SERVICE_NAME = `scaling-real-${Date.now().toString(36)}`;

const runningTaskIds = async () => {
	const tasks = await docker.listTasks({
		filters: JSON.stringify({
			service: [SERVICE_NAME],
			"desired-state": ["running"],
		}),
	});
	return tasks
		.filter((task) => task.Status?.State === "running")
		.map((task) => task.ID as string)
		.sort();
};

describe.runIf(runRealSwarmTests)("scaling (real Docker)", () => {
	beforeAll(async () => {
		await docker.createService({
			Name: SERVICE_NAME,
			TaskTemplate: {
				ContainerSpec: { Image: "traefik/whoami:v1.10.3" },
				Networks: [{ Target: "dokploy-network" }],
			},
			Mode: { Replicated: { Replicas: 2 } },
		});
		await waitForSwarmServiceConvergence(SERVICE_NAME, null, {
			timeoutMs: 120_000,
		});
	}, REAL_TEST_TIMEOUT);

	afterAll(async () => {
		await docker
			.getService(SERVICE_NAME)
			.remove()
			.catch(() => undefined);
	});

	it(
		"adds replicas without restarting the running ones",
		async () => {
			const before = await runningTaskIds();
			const forceUpdateBefore = (
				await docker.getService(SERVICE_NAME).inspect()
			).Spec.TaskTemplate.ForceUpdate;
			expect(before).toHaveLength(2);

			const result = await scaleService({
				docker,
				serviceName: SERVICE_NAME,
				replicas: 3,
				expectedFrom: 2,
			});
			await waitForSwarmServiceConvergence(SERVICE_NAME, null, {
				timeoutMs: 120_000,
			});

			const after = await runningTaskIds();
			const inspect = await docker.getService(SERVICE_NAME).inspect();
			expect(result).toEqual({ from: 2, to: 3, changed: true });
			expect(after).toHaveLength(3);
			expect(after).toEqual(expect.arrayContaining(before));
			expect(inspect.Spec.TaskTemplate.ForceUpdate).toBe(forceUpdateBefore);
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"spreads new connections through the service VIP across every replica",
		async () => {
			const { stdout } = await execFileAsync("docker", [
				"run",
				"--rm",
				"--network",
				"dokploy-network",
				"curlimages/curl:8.10.1",
				"sh",
				"-c",
				`for i in $(seq 1 30); do curl -s http://${SERVICE_NAME}/ | grep ^Hostname; done`,
			]);
			const hostnames = new Set(
				stdout
					.split("\n")
					.map((line) => line.trim())
					.filter(Boolean),
			);
			expect(hostnames.size).toBe(3);
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"scales down to the requested count",
		async () => {
			await scaleService({ docker, serviceName: SERVICE_NAME, replicas: 1 });
			const deadline = Date.now() + 120_000;
			while ((await runningTaskIds()).length !== 1 && Date.now() < deadline) {
				await new Promise((resolve) => setTimeout(resolve, 2_000));
			}

			expect(await runningTaskIds()).toHaveLength(1);
		},
		REAL_TEST_TIMEOUT,
	);

	it(
		"refuses to scale while Swarm is rolling out an update",
		async () => {
			await scaleService({ docker, serviceName: SERVICE_NAME, replicas: 2 });
			await waitForSwarmServiceConvergence(SERVICE_NAME, null, {
				timeoutMs: 120_000,
			});

			const service = docker.getService(SERVICE_NAME);
			const inspect = await service.inspect();
			await service.update({
				_query: { version: inspect.Version.Index },
				_body: {
					...inspect.Spec,
					TaskTemplate: {
						...inspect.Spec.TaskTemplate,
						ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
					},
					UpdateConfig: { Parallelism: 1, Delay: 60_000_000_000 },
				},
			});

			const deadline = Date.now() + 30_000;
			let state: string | undefined;
			while (state !== "updating" && Date.now() < deadline) {
				state = (await service.inspect()).UpdateStatus?.State;
				if (state !== "updating") {
					await new Promise((resolve) => setTimeout(resolve, 500));
				}
			}
			expect(state).toBe("updating");

			await expect(
				scaleService({ docker, serviceName: SERVICE_NAME, replicas: 4 }),
			).rejects.toMatchObject({ reason: "rollout_in_progress" });
			expect((await service.inspect()).Spec.Mode.Replicated.Replicas).toBe(2);
		},
		REAL_TEST_TIMEOUT,
	);
});
