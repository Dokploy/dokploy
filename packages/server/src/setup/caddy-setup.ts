import type { ContainerCreateOptions, CreateServiceOptions } from "dockerode";
import { paths } from "../constants";
import {
	CADDY_METRICS_PORT,
	ensureDefaultCaddyConfig,
	reloadCaddyAfterValidation,
	validateCaddyConfigWithContainer,
} from "../utils/caddy/config";
import type {
	CaddyAccessLogConfig,
	CaddyTrustedProxyConfig,
} from "../utils/caddy/types";
import { getRemoteDocker } from "../utils/servers/remote-docker";

export const CADDY_SSL_PORT =
	Number.parseInt(process.env.CADDY_SSL_PORT ?? "", 10) || 443;
export const CADDY_PORT =
	Number.parseInt(process.env.CADDY_PORT ?? "", 10) || 80;
export const CADDY_HTTP3_PORT =
	Number.parseInt(process.env.CADDY_HTTP3_PORT ?? "", 10) || 443;
export const CADDY_ADMIN_PORT = 2019;
const CADDY_RESERVED_TCP_PORTS = new Set([
	CADDY_ADMIN_PORT,
	CADDY_METRICS_PORT,
]);
const CADDY_TRAEFIK_CARRY_OVER_TCP_TARGET_PORTS = new Set([
	8080,
	8082,
	...CADDY_RESERVED_TCP_PORTS,
]);
export const CADDY_VERSION = process.env.CADDY_VERSION || "2.11.4";

export interface CaddyOptions {
	env?: string[];
	serverId?: string;
	additionalPorts?: {
		targetPort: number;
		publishedPort: number;
		protocol?: string;
	}[];
	letsEncryptEmail?: string | null;
	trustedProxies?: CaddyTrustedProxyConfig | null;
	accessLogs?: CaddyAccessLogConfig | null;
}

type CaddyAdditionalPort = NonNullable<CaddyOptions["additionalPorts"]>[number];

const usesTcp = (port: CaddyAdditionalPort) =>
	(port.protocol ?? "tcp") === "tcp";

export const isCaddyAdminAdditionalPort = (port: CaddyAdditionalPort) =>
	usesTcp(port) &&
	(port.targetPort === CADDY_ADMIN_PORT ||
		port.publishedPort === CADDY_ADMIN_PORT);

export const isCaddyAdminPort = isCaddyAdminAdditionalPort;
export const isCaddyReservedAdditionalPort = (port: CaddyAdditionalPort) =>
	usesTcp(port) &&
	(CADDY_RESERVED_TCP_PORTS.has(port.targetPort) ||
		CADDY_RESERVED_TCP_PORTS.has(port.publishedPort));

export const isTraefikCarryOverPortForCaddyMigration = (
	port: CaddyAdditionalPort,
) =>
	usesTcp(port) &&
	(CADDY_TRAEFIK_CARRY_OVER_TCP_TARGET_PORTS.has(port.targetPort) ||
		CADDY_RESERVED_TCP_PORTS.has(port.publishedPort));

export const filterCaddyAdditionalPorts = (
	additionalPorts: CaddyOptions["additionalPorts"] = [],
) => additionalPorts.filter((port) => !isCaddyReservedAdditionalPort(port));

export const filterTraefikCarryOverPortsForCaddyMigration = (
	additionalPorts: CaddyOptions["additionalPorts"] = [],
) =>
	additionalPorts.filter(
		(port) => !isTraefikCarryOverPortForCaddyMigration(port),
	);

const getCaddyMounts = (serverId?: string) => {
	const { CADDY_CONFIG_DIR_PATH, CADDY_DATA_PATH, MAIN_CADDY_PATH } = paths(
		!!serverId,
	);
	const { CERTIFICATES_PATH } = paths(!!serverId);

	return {
		MAIN_CADDY_PATH,
		binds: [
			`${MAIN_CADDY_PATH}:/etc/caddy`,
			`${CADDY_DATA_PATH}:/data`,
			`${CADDY_CONFIG_DIR_PATH}:/config`,
			`${CERTIFICATES_PATH}:${CERTIFICATES_PATH}:ro`,
		],
		serviceMounts: [
			{
				Type: "bind" as const,
				Source: MAIN_CADDY_PATH,
				Target: "/etc/caddy",
			},
			{
				Type: "bind" as const,
				Source: CADDY_DATA_PATH,
				Target: "/data",
			},
			{
				Type: "bind" as const,
				Source: CADDY_CONFIG_DIR_PATH,
				Target: "/config",
			},
			{
				Type: "bind" as const,
				Source: CERTIFICATES_PATH,
				Target: CERTIFICATES_PATH,
				ReadOnly: true,
			},
		],
	};
};

const buildStandalonePorts = (
	additionalPorts: CaddyOptions["additionalPorts"],
) => {
	const exposedPorts: Record<string, {}> = {
		[`${CADDY_PORT}/tcp`]: {},
		[`${CADDY_SSL_PORT}/tcp`]: {},
		[`${CADDY_HTTP3_PORT}/udp`]: {},
	};

	const portBindings: Record<string, Array<{ HostPort: string }>> = {
		[`${CADDY_PORT}/tcp`]: [{ HostPort: CADDY_PORT.toString() }],
		[`${CADDY_SSL_PORT}/tcp`]: [{ HostPort: CADDY_SSL_PORT.toString() }],
		[`${CADDY_HTTP3_PORT}/udp`]: [{ HostPort: CADDY_HTTP3_PORT.toString() }],
	};

	for (const port of filterCaddyAdditionalPorts(additionalPorts)) {
		const portKey = `${port.targetPort}/${port.protocol ?? "tcp"}`;
		exposedPorts[portKey] = {};
		portBindings[portKey] = [{ HostPort: port.publishedPort.toString() }];
	}

	return { exposedPorts, portBindings };
};

const pullImage = async (
	docker: Awaited<ReturnType<typeof getRemoteDocker>>,
	imageName: string,
) => {
	await new Promise<void>((resolve, reject) => {
		docker.pull(
			imageName,
			(error: Error | null, stream?: NodeJS.ReadableStream) => {
				if (error) {
					reject(error);
					return;
				}
				if (!stream) {
					resolve();
					return;
				}
				docker.modem.followProgress(stream, (progressError?: Error | null) => {
					if (progressError) {
						reject(progressError);
						return;
					}
					resolve();
				});
			},
		);
	});
};

const buildServicePorts = (
	additionalPorts: CaddyOptions["additionalPorts"],
) => [
	{
		TargetPort: 443,
		PublishedPort: CADDY_SSL_PORT,
		PublishMode: "host" as const,
		Protocol: "tcp" as const,
	},
	{
		TargetPort: 443,
		PublishedPort: CADDY_HTTP3_PORT,
		PublishMode: "host" as const,
		Protocol: "udp" as const,
	},
	{
		TargetPort: 80,
		PublishedPort: CADDY_PORT,
		PublishMode: "host" as const,
		Protocol: "tcp" as const,
	},
	...filterCaddyAdditionalPorts(additionalPorts).map((port) => ({
		TargetPort: port.targetPort,
		PublishedPort: port.publishedPort,
		Protocol: port.protocol as "tcp" | "udp" | "sctp" | undefined,
		PublishMode: "host" as const,
	})),
];

export const initializeStandaloneCaddy = async ({
	env,
	serverId,
	additionalPorts = [],
	letsEncryptEmail,
	trustedProxies,
	accessLogs,
}: CaddyOptions = {}) => {
	await ensureDefaultCaddyConfig({
		serverId,
		letsEncryptEmail,
		trustedProxies,
		accessLogs,
	});
	const imageName = `caddy:${CADDY_VERSION}`;
	const containerName = "dokploy-caddy";
	const { binds } = getCaddyMounts(serverId);
	const { exposedPorts, portBindings } = buildStandalonePorts(additionalPorts);

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		Cmd: ["caddy", "run", "--config", "/etc/caddy/caddy.json"],
		NetworkingConfig: {
			EndpointsConfig: {
				"dokploy-network": {},
			},
		},
		ExposedPorts: exposedPorts,
		HostConfig: {
			RestartPolicy: {
				Name: "always",
			},
			Binds: binds,
			PortBindings: portBindings,
		},
		Env: env,
	};

	const docker = await getRemoteDocker(serverId);
	try {
		await pullImage(docker, imageName);
		console.log("Caddy Image Pulled ✅");
	} catch (error) {
		console.log("Caddy Image Not Found: Pulling ", error);
	}
	try {
		const container = docker.getContainer(containerName);
		await container.remove({ force: true });
		await new Promise((resolve) => setTimeout(resolve, 5000));
	} catch {}

	await docker.createContainer(settings);
	const newContainer = docker.getContainer(containerName);
	await newContainer.start();
	await validateCaddyConfigWithContainer(serverId);
	console.log("Caddy Started ✅");
};

export const initializeCaddyService = async ({
	env,
	additionalPorts = [],
	serverId,
	letsEncryptEmail,
	trustedProxies,
	accessLogs,
}: CaddyOptions) => {
	await ensureDefaultCaddyConfig({
		serverId,
		letsEncryptEmail,
		trustedProxies,
		accessLogs,
	});
	const imageName = `caddy:${CADDY_VERSION}`;
	const appName = "dokploy-caddy";
	const { serviceMounts } = getCaddyMounts(serverId);

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Command: ["caddy", "run", "--config", "/etc/caddy/caddy.json"],
				Env: env,
				Mounts: serviceMounts,
			},
			Networks: [{ Target: "dokploy-network" }],
			Placement: {
				Constraints: ["node.role==manager"],
			},
		},
		Mode: {
			Replicated: {
				Replicas: 1,
			},
		},
		EndpointSpec: {
			Ports: buildServicePorts(additionalPorts),
		},
	};
	const docker = await getRemoteDocker(serverId);
	try {
		await pullImage(docker, imageName);
		console.log("Caddy Image Pulled ✅");
	} catch (error) {
		console.log("Caddy Image Not Found: Pulling ", error);
	}
	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();

		await service.update({
			version: inspect.Version.Index,
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: (inspect.Spec.TaskTemplate.ForceUpdate ?? 0) + 1,
			},
		});
		console.log("Caddy Updated ✅");
	} catch {
		await docker.createService(settings);
		console.log("Caddy Started ✅");
	}
};

export const createDefaultCaddyConfig = async (options: CaddyOptions = {}) => {
	await ensureDefaultCaddyConfig(options);
};

export const validateCaddyConfig = validateCaddyConfigWithContainer;
export const reloadCaddy = reloadCaddyAfterValidation;
