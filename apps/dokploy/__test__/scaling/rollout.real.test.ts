import { docker } from "@dokploy/server/constants";
import { toUpdateConfig } from "@dokploy/server/services/scaling/scaling-settings";
import { waitForSwarmServiceConvergence } from "@dokploy/server/utils/docker/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REAL_TEST_TIMEOUT, runRealSwarmTests, waitFor } from "./real-swarm";

const SERVICE_NAME = `rollout-real-${Date.now().toString(36)}`;
const SECOND = 1_000_000_000;

const healthyCheck = {
	Test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/ || exit 1"],
	Interval: SECOND,
	Timeout: 2 * SECOND,
	Retries: 2,
};

describe.runIf(runRealSwarmTests)("rollout strategy (real Docker)", () => {
	beforeAll(async () => {
		await docker.createService({
			Name: SERVICE_NAME,
			TaskTemplate: {
				ContainerSpec: {
					Image: "nginx:1.27-alpine",
					HealthCheck: healthyCheck,
				},
			},
			Mode: { Replicated: { Replicas: 2 } },
			UpdateConfig: toUpdateConfig({
				strategy: "start-first",
				batchSize: 1,
				delaySeconds: 0,
				monitorSeconds: 5,
				failureAction: "rollback",
				maxFailureRatioPercent: 0,
			}),
			RollbackConfig: { Parallelism: 1, Order: "start-first" },
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
		"rolls back on its own when the new version fails its health check",
		async () => {
			const service = docker.getService(SERVICE_NAME);
			const inspect = await service.inspect();
			await service.update({
				_query: { version: inspect.Version.Index },
				_body: {
					...inspect.Spec,
					TaskTemplate: {
						...inspect.Spec.TaskTemplate,
						ContainerSpec: {
							...inspect.Spec.TaskTemplate.ContainerSpec,
							// Swarm returns the field as "Healthcheck"; overwrite that key
							// rather than adding a second spelling next to it.
							Healthcheck: {
								Test: ["CMD-SHELL", "exit 1"],
								Interval: SECOND,
								Timeout: SECOND,
								Retries: 1,
							},
						},
						ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
					},
				},
			});

			const finalState = await waitFor(
				async () => (await service.inspect()).UpdateStatus?.State,
				(state) =>
					state === "rollback_completed" || state === "rollback_paused",
				150_000,
			);
			expect(finalState).toBe("rollback_completed");

			const after = await service.inspect();
			expect(after.Spec.TaskTemplate.ContainerSpec.Healthcheck.Test).toEqual(
				healthyCheck.Test,
			);
			await waitForSwarmServiceConvergence(SERVICE_NAME, null, {
				timeoutMs: 120_000,
			});
		},
		REAL_TEST_TIMEOUT,
	);
});
