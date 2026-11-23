import { findServerById } from "@dokploy/server/services/server";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import type { CreateServiceOptions } from "dockerode";
import { IS_CLOUD } from "../constants";
import { getDokployImageTag } from "../services/settings";
import { isDockerNotFoundError } from "../utils/docker/swarm-service";
import { pullImage, pullRemoteImage } from "../utils/docker/utils";
import { getRemoteDocker } from "../utils/servers/remote-docker";

const MONITORING_SERVICE = "dokploy-monitoring";
const MONITORING_REPOSITORY = "dokploy/monitoring";

export const getMonitoringImage = () => {
	if (process.env.DOKPLOY_MONITORING_IMAGE) {
		return process.env.DOKPLOY_MONITORING_IMAGE;
	}
	const channel =
		(getDokployImageTag() !== "latest" ||
			process.env.NODE_ENV === "development") &&
		!IS_CLOUD
			? "canary"
			: "latest";
	return `${MONITORING_REPOSITORY}:${channel}`;
};

type Docker = Awaited<ReturnType<typeof getRemoteDocker>>;
type MetricsConfig = NonNullable<
	Awaited<ReturnType<typeof getWebServerSettings>>
>["metricsConfig"];

/**
 * The agent runs on every node of the swarm (global mode): Docker only reports
 * stats for containers on its own host, so per-replica metrics need one agent
 * per node. Its database lives in a named volume because a bind-mounted file
 * would only exist on the node Dokploy prepared.
 */
export const buildMonitoringServiceSpec = ({
	image,
	metricsConfig,
	publishPort,
}: {
	image: string;
	metricsConfig: MetricsConfig;
	publishPort?: number;
}): CreateServiceOptions => ({
	Name: MONITORING_SERVICE,
	TaskTemplate: {
		ContainerSpec: {
			Image: image,
			Env: [
				`METRICS_CONFIG=${JSON.stringify(metricsConfig)}`,
				"MONITORING_DB_PATH=/app/data/monitoring.db",
			],
			Mounts: [
				{
					Type: "bind",
					Source: "/var/run/docker.sock",
					Target: "/var/run/docker.sock",
					ReadOnly: true,
				},
				{ Type: "bind", Source: "/sys", Target: "/host/sys", ReadOnly: true },
				{
					Type: "bind",
					Source: "/etc/os-release",
					Target: "/etc/os-release",
					ReadOnly: true,
				},
				{ Type: "bind", Source: "/proc", Target: "/host/proc", ReadOnly: true },
				{
					Type: "volume",
					Source: "dokploy-monitoring-data",
					Target: "/app/data",
				},
			],
		},
		...(publishPort === undefined && { Networks: [{ Target: "host" }] }),
	},
	Mode: { Global: {} },
	...(publishPort !== undefined && {
		EndpointSpec: {
			Ports: [
				{
					TargetPort: publishPort,
					PublishedPort: publishPort,
					Protocol: "tcp",
					PublishMode: "host",
				},
			],
		},
	}),
});

// A failed pull is fine when the image is already on the node, which is how
// air-gapped hosts and locally built agents are run.
const pullOrUseLocal = async (
	docker: Docker,
	image: string,
	pull: () => Promise<unknown>,
) => {
	try {
		await pull();
	} catch (error) {
		try {
			await docker.getImage(image).inspect();
			console.warn(`Could not pull ${image}; using the local image.`);
		} catch {
			throw error;
		}
	}
};

// Swarm tasks are dokploy-monitoring.<id>, so this only matches the
// pre-v0.30.0 standalone container. A cleanup failure must not block the deploy.
const removeLegacyContainer = async (docker: Docker) => {
	try {
		await docker.getContainer(MONITORING_SERVICE).remove({ force: true });
		console.log("Removed legacy monitoring container ✅");
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			console.warn(
				`Could not remove legacy monitoring container: ${error?.message ?? error}`,
			);
		}
	}
};

export const deployMonitoringService = async (
	docker: Docker,
	settings: CreateServiceOptions,
) => {
	await removeLegacyContainer(docker);

	const service = docker.getService(MONITORING_SERVICE);
	let inspect: Awaited<ReturnType<typeof service.inspect>> | null = null;
	try {
		inspect = await service.inspect();
	} catch (error) {
		if (!isDockerNotFoundError(error)) throw error;
	}

	// Swarm cannot change a service's mode in place, so the replicated agent
	// from earlier versions is replaced by the global one.
	if (inspect && !inspect.Spec?.Mode?.Global) {
		await service.remove();
		inspect = null;
		console.log("Removed replicated monitoring service ✅");
	}

	if (inspect) {
		await service.update({
			version: Number.parseInt(String(inspect.Version.Index)),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: (inspect.Spec.TaskTemplate.ForceUpdate ?? 0) + 1,
			},
		});
		console.log("Monitoring Updated ✅");
		return;
	}
	await docker.createService(settings);
	console.log("Monitoring Started ✅");
};

export const setupMonitoring = async (serverId: string) => {
	const server = await findServerById(serverId);
	const image = getMonitoringImage();
	const docker = await getRemoteDocker(serverId);

	await pullOrUseLocal(docker, image, () => pullRemoteImage(image, serverId));
	await deployMonitoringService(
		docker,
		buildMonitoringServiceSpec({ image, metricsConfig: server.metricsConfig }),
	);
};

export const setupWebMonitoring = async () => {
	const webServerSettings = await getWebServerSettings();
	if (!webServerSettings) throw new Error("Web server settings are missing");
	const image = getMonitoringImage();
	const docker = await getRemoteDocker();

	await pullOrUseLocal(docker, image, () => pullImage(image));
	await deployMonitoringService(
		docker,
		buildMonitoringServiceSpec({
			image,
			metricsConfig: webServerSettings.metricsConfig,
			publishPort: webServerSettings.metricsConfig.server.port,
		}),
	);
};
