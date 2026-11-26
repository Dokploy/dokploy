import { docker } from "@dokploy/server/constants";
import {
	type CapacityApplication,
	getApplicationCapacity,
} from "@dokploy/server/services/scaling/capacity-service";
import { scaleService } from "@dokploy/server/services/scaling/scale-service";
import { waitForSwarmServiceConvergence } from "@dokploy/server/utils/docker/utils";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { REAL_TEST_TIMEOUT, runRealSwarmTests, waitFor } from "./real-swarm";

const SERVICE_NAME = `capacity-real-${Date.now().toString(36)}`;

const application: CapacityApplication = {
	applicationId: SERVICE_NAME,
	appName: SERVICE_NAME,
	serverId: null,
	replicas: 1,
	modeSwarm: null,
	healthCheckSwarm: null,
	server: null,
	sourceType: "docker",
	registryId: null,
	buildRegistryId: null,
	cpuLimit: null,
	cpuReservation: null,
	memoryLimit: null,
	memoryReservation: null,
	placementSwarm: null,
	endpointSpecSwarm: null,
	mounts: [],
	ports: [],
};

const serviceTasks = async () =>
	docker.listTasks({
		filters: JSON.stringify({
			service: [SERVICE_NAME],
			"desired-state": ["running"],
		}),
	});

describe.runIf(runRealSwarmTests)("capacity estimate (real Docker)", () => {
	beforeAll(async () => {
		const [node] = (await docker.listNodes()).filter(
			(candidate) =>
				candidate.Status?.State === "ready" &&
				candidate.Spec?.Availability === "active",
		);
		const totalCpu: number = node.Description.Resources.NanoCPUs;
		// Roughly a third of the node per replica, so only a few replicas fit
		// whatever the CI machine's size.
		const cpuPerReplica = Math.floor(totalCpu / 3 / 1_000_000) * 1_000_000;

		await docker.createService({
			Name: SERVICE_NAME,
			TaskTemplate: {
				ContainerSpec: { Image: "traefik/whoami:v1.10.3" },
				Resources: { Reservations: { NanoCPUs: cpuPerReplica } },
			},
			Mode: { Replicated: { Replicas: 1 } },
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
		"predicts the point where Swarm stops placing replicas",
		async () => {
			const estimate = await getApplicationCapacity(application, 1, {
				fresh: true,
			});
			expect(estimate.deployed).toBe(true);
			expect(estimate.requirements.cpuReservation).toBeGreaterThan(0);
			const placeable = estimate.placeable as number;
			expect(placeable).toBeGreaterThanOrEqual(1);

			await scaleService({
				docker,
				serviceName: SERVICE_NAME,
				replicas: placeable,
			});
			await waitForSwarmServiceConvergence(SERVICE_NAME, null, {
				timeoutMs: 120_000,
			});

			const over = await getApplicationCapacity(application, placeable + 1, {
				fresh: true,
			});
			expect(over.fit).toBe("insufficient");

			await scaleService({
				docker,
				serviceName: SERVICE_NAME,
				replicas: placeable + 1,
			});
			const tasks = await waitFor(serviceTasks, (current) =>
				current.some((task) => task.Status?.State === "pending"),
			);

			const running = tasks.filter((task) => task.Status?.State === "running");
			const pending = tasks.filter((task) => task.Status?.State === "pending");
			expect(running).toHaveLength(placeable);
			expect(pending).toHaveLength(1);
			expect(pending[0]?.Status?.Err).toMatch(/insufficient resources/);
		},
		REAL_TEST_TIMEOUT,
	);
});
