import { createHash } from "node:crypto";
import type Docker from "dockerode";
import type { CreateServiceOptions } from "dockerode";
import { docker as localDocker } from "../constants";
import {
	isDockerNotFoundError,
	type ServiceInspectInfo,
} from "../utils/docker/swarm-service";

export const AUTOSCALER_SERVICE = "dokploy-autoscaler";
const DOKPLOY_SERVICE = "dokploy";
const SPEC_LABEL = "dokploy.autoscaler.spec";
const HEALTH_PORT = 3100;
const SECOND = 1_000_000_000;

type ServiceSpec = NonNullable<ServiceInspectInfo["Spec"]>;

/**
 * The autoscaler runs Dokploy's own image with Dokploy's own environment,
 * secrets, mounts and network, so it reaches the same database, Docker
 * socket, compose files and SSH keys, and always matches Dokploy's version.
 */
export const buildAutoscalerServiceSpec = (
	dokploy: ServiceSpec,
): CreateServiceOptions => {
	const container = dokploy.TaskTemplate?.ContainerSpec ?? {};
	const spec: CreateServiceOptions = {
		Name: AUTOSCALER_SERVICE,
		TaskTemplate: {
			ContainerSpec: {
				Image: container.Image,
				Env: [
					...(container.Env ?? []).filter(
						(entry: string) => !entry.startsWith("AUTOSCALER_HEALTH_PORT="),
					),
					`AUTOSCALER_HEALTH_PORT=${HEALTH_PORT}`,
				],
				...(container.Secrets && { Secrets: container.Secrets }),
				...(container.Mounts && { Mounts: container.Mounts }),
				...(container.User && { User: container.User }),
				Command: [
					"sh",
					"-c",
					"node -r dotenv/config dist/wait-for-postgres.mjs && exec node -r dotenv/config dist/autoscaler.mjs",
				],
				// The image's own health check probes the web app's port.
				HealthCheck: {
					Test: [
						"CMD",
						"curl",
						"-fs",
						`http://127.0.0.1:${HEALTH_PORT}/health`,
					],
					Interval: 30 * SECOND,
					Timeout: 5 * SECOND,
					StartPeriod: 60 * SECOND,
					Retries: 3,
				},
				StopGracePeriod: 15 * SECOND,
			},
			Networks: dokploy.TaskTemplate?.Networks ?? dokploy.Networks,
			...(dokploy.TaskTemplate?.Placement && {
				Placement: dokploy.TaskTemplate.Placement,
			}),
			RestartPolicy: { Condition: "any", Delay: 10 * SECOND },
		},
		Mode: { Replicated: { Replicas: 1 } },
		// The leader lock keeps two controllers from acting at once; stopping
		// the old one first just avoids a pointless standby.
		UpdateConfig: { Parallelism: 1, Order: "stop-first" },
	};
	const fingerprint = createHash("sha256")
		.update(JSON.stringify(spec))
		.digest("hex")
		.slice(0, 16);
	return { ...spec, Labels: { [SPEC_LABEL]: fingerprint } };
};

const inspectOrNull = async (service: Docker.Service) => {
	try {
		return (await service.inspect()) as ServiceInspectInfo;
	} catch (error) {
		if (isDockerNotFoundError(error)) return null;
		throw error;
	}
};

/**
 * Creates or updates the autoscaler service to match the running Dokploy
 * service. Called on every Dokploy start, so an upgrade moves both together.
 * DOKPLOY_AUTOSCALER=off removes it instead.
 */
export const ensureAutoscalerService = async (
	docker: Docker = localDocker,
): Promise<"created" | "updated" | "unchanged" | "removed" | "skipped"> => {
	const autoscaler = docker.getService(AUTOSCALER_SERVICE);
	const current = await inspectOrNull(autoscaler);

	if (process.env.DOKPLOY_AUTOSCALER === "off") {
		if (!current) return "skipped";
		await autoscaler.remove();
		return "removed";
	}

	const dokploy = await inspectOrNull(docker.getService(DOKPLOY_SERVICE));
	if (!dokploy?.Spec) return "skipped";

	const spec = buildAutoscalerServiceSpec(dokploy.Spec);
	if (!current) {
		await docker.createService(spec);
		return "created";
	}
	if (current.Spec?.Labels?.[SPEC_LABEL] === spec.Labels?.[SPEC_LABEL]) {
		return "unchanged";
	}
	await autoscaler.update({
		version: Number.parseInt(String(current.Version?.Index), 10),
		...spec,
	});
	return "updated";
};
