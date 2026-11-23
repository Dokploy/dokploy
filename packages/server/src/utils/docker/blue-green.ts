import type Dockerode from "dockerode";
import type { CreateServiceOptions } from "dockerode";
import {
	greenServiceName,
	switchApplicationTraffic,
} from "../traefik/blue-green";
import { isDockerNotFoundError, type ServiceInspectInfo } from "./swarm-service";
import { waitForSwarmServiceConvergence } from "./utils";

const ROLLOUT_FAILED_STATES = new Set([
	"paused",
	"rollback_started",
	"rollback_paused",
	"rollback_completed",
]);

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const BLUE_GREEN_TIMEOUT_MS = 5 * 60_000;
// Traefik applies a changed file within a moment; a request that already
// picked the old service finishes in this time.
export const BLUE_GREEN_SETTLE_MS = 5_000;

export const canRunBlueGreen = ({
	existing,
	settings,
}: {
	existing: ServiceInspectInfo | null;
	settings: CreateServiceOptions;
}) => {
	const live = existing?.Spec?.Mode?.Replicated?.Replicas;
	const wanted = settings.Mode?.Replicated?.Replicas;
	// A fixed host port can only be bound by one of the two services at a time.
	const publishesPorts = (settings.EndpointSpec?.Ports?.length ?? 0) > 0;
	return (
		live !== undefined &&
		live > 0 &&
		wanted !== undefined &&
		wanted > 0 &&
		!publishesPorts
	);
};

const removeServiceIfPresent = async (docker: Dockerode, name: string) => {
	try {
		await docker.getService(name).remove();
	} catch (error) {
		if (!isDockerNotFoundError(error)) throw error;
	}
};

const waitForRolloutToFinish = async (
	docker: Dockerode,
	name: string,
	previousStartedAt: string | undefined,
	timeoutMs: number,
) => {
	const deadline = Date.now() + timeoutMs;
	while (true) {
		const inspect: ServiceInspectInfo = await docker.getService(name).inspect();
		const status = inspect.UpdateStatus as
			| { State?: string; StartedAt?: string; Message?: string }
			| undefined;
		// The status of the previous update stays until the new one begins.
		if (status && status.StartedAt !== previousStartedAt) {
			if (status.State === "completed") return;
			if (status.State && ROLLOUT_FAILED_STATES.has(status.State)) {
				throw new Error(
					`The update of ${name} failed (${status.State}): ${status.Message ?? "no details"}`,
				);
			}
		}
		if (Date.now() >= deadline) {
			throw new Error(`The update of ${name} did not finish in time`);
		}
		await sleep(2_000);
	}
};

/**
 * Blue/green deploy that keeps the service name stable. The new version
 * first runs as a temporary twin (`<app>-green`); once it is healthy the
 * domains move to it, the real service is updated while it takes no
 * traffic, and the domains move back before the twin is removed. Logs,
 * scaling, stop and the rest keep addressing the real service.
 */
export const rolloutBlueGreen = async ({
	docker,
	serverId,
	appName,
	settings,
	updateService,
	timeoutMs = BLUE_GREEN_TIMEOUT_MS,
	settleMs = BLUE_GREEN_SETTLE_MS,
}: {
	docker: Dockerode;
	serverId: string | null | undefined;
	appName: string;
	settings: CreateServiceOptions;
	updateService: () => Promise<unknown>;
	timeoutMs?: number;
	settleMs?: number;
}) => {
	const green = greenServiceName(appName);

	// A deploy that died midway can leave the domains on the twin.
	await switchApplicationTraffic(appName, serverId, appName);
	await removeServiceIfPresent(docker, green);

	const template = settings.TaskTemplate as Dockerode.ContainerTaskSpec;
	const greenSettings: CreateServiceOptions = {
		...settings,
		Name: green,
		TaskTemplate: {
			...template,
			ContainerSpec: {
				...template.ContainerSpec,
				// Dokploy's labels would make the twin count as part of the application.
				Labels: Object.fromEntries(
					Object.entries(template.ContainerSpec?.Labels ?? {}).filter(
						([key]) => !key.startsWith("dokploy."),
					),
				),
			},
		},
	};

	try {
		await (settings.authconfig
			? docker.createService(settings.authconfig, greenSettings)
			: docker.createService(greenSettings));
		await waitForSwarmServiceConvergence(green, serverId, { timeoutMs });
		// A container that crashes right after starting is briefly "running".
		await sleep(settleMs);
		await waitForSwarmServiceConvergence(green, serverId, { timeoutMs });
	} catch (error) {
		await removeServiceIfPresent(docker, green).catch(() => {});
		throw error;
	}

	await switchApplicationTraffic(appName, serverId, green);
	await sleep(settleMs);

	try {
		const before = (await docker.getService(appName).inspect()) as {
			UpdateStatus?: { StartedAt?: string };
		};
		await updateService();
		await waitForRolloutToFinish(
			docker,
			appName,
			before.UpdateStatus?.StartedAt,
			timeoutMs,
		);
	} catch (error) {
		await switchApplicationTraffic(appName, serverId, appName);
		await removeServiceIfPresent(docker, green).catch(() => {});
		throw error;
	}

	await switchApplicationTraffic(appName, serverId, appName);
	await sleep(settleMs);
	await removeServiceIfPresent(docker, green);
};
