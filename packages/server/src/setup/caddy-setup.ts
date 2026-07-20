import type { ContainerCreateOptions, CreateServiceOptions } from "dockerode";
import { paths } from "../constants";
import {
	CADDY_METRICS_PORT,
	ensureDefaultCaddyConfig,
	readCaddyConfigFileIfExists,
	reloadCaddyAfterValidation,
	validateCaddyConfigFileWithImage,
	validateCaddyConfigWithContainer,
	withCaddyConfigLock,
	writeCaddyConfigContent,
} from "../utils/caddy/config";
import { runActiveCaddyUpstreamPreflight } from "../utils/caddy/migration/upstream-preflight";
import type {
	CaddyAccessLogConfig,
	CaddyTrustedProxyConfig,
} from "../utils/caddy/types";
import { DOKPLOY_CADDY_NETWORK } from "../utils/caddy/upstream-targets";
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
export const CADDY_IMAGE =
	process.env.CADDY_IMAGE?.trim() || `caddy:${CADDY_VERSION}`;

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
type DockerClient = Awaited<ReturnType<typeof getRemoteDocker>>;
type DockerContainer = ReturnType<DockerClient["getContainer"]>;
type DockerService = ReturnType<DockerClient["getService"]>;
type CaddyPostStartHook = () => Promise<unknown>;
type DockerTaskSnapshot = {
	Status?: { State?: string };
	Spec?: { ContainerSpec?: { Image?: string } };
};

type RetainedCaddyContainer = {
	container: DockerContainer;
	wasRunning: boolean;
	stopped: boolean;
	renamed: boolean;
	rollbackName: string;
};

type ExistingCaddyContainer = {
	container: DockerContainer;
	wasRunning: boolean;
	networkNames: string[];
};

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
	const {
		CADDY_CONFIG_DIR_PATH,
		CADDY_CONFIG_PATH,
		CADDY_DATA_PATH,
		MAIN_CADDY_PATH,
	} = paths(!!serverId);
	const { CERTIFICATES_PATH } = paths(!!serverId);

	return {
		MAIN_CADDY_PATH,
		CADDY_CONFIG_PATH,
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

const pullImage = async (docker: DockerClient, imageName: string) => {
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

const isDockerNotFoundError = (error: unknown) =>
	typeof error === "object" &&
	error !== null &&
	"statusCode" in error &&
	error.statusCode === 404;

const getExistingContainer = async (
	docker: DockerClient,
	containerName: string,
): Promise<ExistingCaddyContainer | undefined> => {
	const container = docker.getContainer(containerName);
	try {
		const inspect = await container.inspect();
		return {
			container,
			wasRunning: inspect.State.Running,
			networkNames: Object.keys(inspect.NetworkSettings?.Networks ?? {}),
		};
	} catch (error) {
		if (isDockerNotFoundError(error)) {
			return undefined;
		}
		throw error;
	}
};

const buildStandaloneNetworkEndpoints = (networkNames: string[]) =>
	Object.fromEntries(
		[...new Set([DOKPLOY_CADDY_NETWORK, ...networkNames])].map((network) => [
			network,
			{},
		]),
	);

const assertContainerNetworks = async (
	container: DockerContainer,
	requiredNetworkNames: string[],
) => {
	const inspect = await container.inspect();
	const attached = new Set(
		Object.keys(inspect.NetworkSettings?.Networks ?? {}),
	);
	const missing = [...new Set(requiredNetworkNames)].filter(
		(network) => !attached.has(network),
	);
	if (missing.length > 0) {
		throw new Error(
			`Caddy candidate is missing required network attachment(s): ${missing.join(", ")}`,
		);
	}
};

const assertActiveUpstreamsReachable = async (serverId?: string) => {
	const preflight = await runActiveCaddyUpstreamPreflight({ serverId });
	if (preflight.status === "passed") {
		return;
	}
	const failures = preflight.checks
		.filter((check) => check.status === "failed")
		.map((check) => `${check.dial} on ${check.network}: ${check.reason}`);
	throw new Error(
		`Caddy runtime upstream preflight failed${failures.length > 0 ? ` (${failures.join("; ")})` : ""}`,
	);
};

const restoreRetainedCaddyContainer = async (
	retained: RetainedCaddyContainer,
	containerName: string,
) => {
	if (retained.renamed) {
		await retained.container.rename({ name: containerName });
		retained.renamed = false;
	}
	if (retained.wasRunning && retained.stopped) {
		await retained.container.start();
		retained.stopped = false;
	}
};

const stopAndRetainCaddyContainer = async (
	container: DockerContainer,
	wasRunning: boolean,
	containerName: string,
) => {
	const retained: RetainedCaddyContainer = {
		container,
		wasRunning,
		stopped: false,
		renamed: false,
		rollbackName: `${containerName}-rollback-${Date.now()}`,
	};

	try {
		if (wasRunning) {
			await container.stop();
			retained.stopped = true;
		}
		await container.rename({ name: retained.rollbackName });
		retained.renamed = true;
		return retained;
	} catch (error) {
		try {
			await restoreRetainedCaddyContainer(retained, containerName);
		} catch (restoreError) {
			if (error instanceof Error) {
				(error as Error & { restoreError?: unknown }).restoreError =
					restoreError;
			}
		}
		throw error;
	}
};

const removeFailedCandidate = async (
	container: DockerContainer,
	containerName: string,
) => {
	try {
		await container.stop();
	} catch {}
	try {
		await container.remove({ force: true });
	} catch (error) {
		try {
			await container.rename({
				name: `${containerName}-failed-${Date.now()}`,
			});
		} catch (renameError) {
			if (error instanceof Error) {
				(error as Error & { renameError?: unknown }).renameError = renameError;
			}
		}
		throw error;
	}
};

const getExistingService = async (
	docker: DockerClient,
	serviceName: string,
) => {
	const service = docker.getService(serviceName);
	try {
		return { service, inspect: await service.inspect() };
	} catch (error) {
		if (isDockerNotFoundError(error)) {
			return undefined;
		}
		throw error;
	}
};

const mergeServiceNetworks = (
	existingNetworks: Array<{ Target: string; Aliases?: string[] }> = [],
) => {
	const networks = [...existingNetworks, { Target: DOKPLOY_CADDY_NETWORK }];
	return [
		...new Map(networks.map((network) => [network.Target, network])).values(),
	];
};

const serviceTaskUsesImage = (taskImage: unknown, expectedImage: string) =>
	taskImage === expectedImage ||
	(typeof taskImage === "string" && taskImage.startsWith(`${expectedImage}@`));

const waitForCaddyService = async (
	docker: DockerClient,
	service: DockerService,
	expectedImage: string,
	options: { retries?: number; intervalMs?: number } = {},
) => {
	const retries = options.retries ?? 60;
	const intervalMs = options.intervalMs ?? 1000;
	const failedStates = new Set([
		"paused",
		"rollback_started",
		"rollback_paused",
		"rollback_completed",
	]);

	for (let attempt = 0; attempt < retries; attempt++) {
		const inspect = await service.inspect();
		const updateState = inspect.UpdateStatus?.State as string | undefined;
		if (updateState && failedStates.has(updateState)) {
			throw new Error(
				`Caddy service update entered ${updateState}: ${inspect.UpdateStatus?.Message ?? "no daemon message"}`,
			);
		}

		const tasks = (await docker.listTasks({
			filters: {
				service: [inspect.ID ?? service.id],
				"desired-state": ["running"],
			},
		})) as DockerTaskSnapshot[];
		const runningTasks = tasks.filter(
			(task) => task.Status?.State === "running",
		);
		if (
			runningTasks.length > 0 &&
			runningTasks.every((task) =>
				serviceTaskUsesImage(task.Spec?.ContainerSpec?.Image, expectedImage),
			)
		) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error(
		`Caddy service did not converge on ${expectedImage} within ${retries} attempts`,
	);
};

const restoreCaddyService = async (
	docker: DockerClient,
	service: DockerService,
	previousSpec: CreateServiceOptions,
) => {
	const current = await service.inspect();
	await service.update({
		version: current.Version.Index,
		...previousSpec,
	});
	const previousImage = (
		previousSpec.TaskTemplate as
			| { ContainerSpec?: { Image?: string } }
			| undefined
	)?.ContainerSpec?.Image;
	if (previousImage) {
		await waitForCaddyService(docker, service, previousImage);
	}
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

const initializeStandaloneCaddyLockHeld = async (
	{
		env,
		serverId,
		additionalPorts = [],
		letsEncryptEmail,
		trustedProxies,
		accessLogs,
	}: CaddyOptions = {},
	postStartHook?: CaddyPostStartHook,
) => {
	const imageName = CADDY_IMAGE;
	const containerName = "dokploy-caddy";
	const { CADDY_CONFIG_PATH, binds } = getCaddyMounts(serverId);
	const { exposedPorts, portBindings } = buildStandalonePorts(additionalPorts);

	const settings: ContainerCreateOptions = {
		name: containerName,
		Image: imageName,
		Cmd: ["caddy", "run", "--config", "/etc/caddy/caddy.json"],
		NetworkingConfig: {
			EndpointsConfig: buildStandaloneNetworkEndpoints([]),
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

	const previousConfig = await readCaddyConfigFileIfExists({ serverId });
	let retained: RetainedCaddyContainer | undefined;
	let candidate: DockerContainer | undefined;
	try {
		await ensureDefaultCaddyConfig({
			serverId,
			letsEncryptEmail,
			trustedProxies,
			accessLogs,
		});
		const docker = await getRemoteDocker(serverId);
		await pullImage(docker, imageName);
		await docker.getImage(imageName).inspect();
		await validateCaddyConfigFileWithImage(
			CADDY_CONFIG_PATH,
			serverId,
			imageName,
		);
		await assertActiveUpstreamsReachable(serverId);
		console.log("Caddy candidate pulled and validated ✅");

		const existing = await getExistingContainer(docker, containerName);
		settings.NetworkingConfig = {
			EndpointsConfig: buildStandaloneNetworkEndpoints(
				existing?.networkNames ?? [],
			),
		};
		retained = existing
			? await stopAndRetainCaddyContainer(
					existing.container,
					existing.wasRunning,
					containerName,
				)
			: undefined;
		candidate = await docker.createContainer(settings);
		await candidate.start();
		await validateCaddyConfigWithContainer(serverId);
		if (postStartHook) {
			await postStartHook();
		}
		await assertContainerNetworks(candidate, [
			DOKPLOY_CADDY_NETWORK,
			...(existing?.networkNames ?? []),
		]);
		await assertActiveUpstreamsReachable(serverId);
	} catch (error) {
		const restoreErrors: unknown[] = [];
		try {
			if (candidate) {
				await removeFailedCandidate(candidate, containerName);
			}
		} catch (restoreError) {
			restoreErrors.push(restoreError);
		}
		try {
			if (previousConfig) {
				await writeCaddyConfigContent(previousConfig, { serverId });
			}
		} catch (restoreError) {
			restoreErrors.push(restoreError);
		}
		try {
			if (retained) {
				await restoreRetainedCaddyContainer(retained, containerName);
			}
		} catch (restoreError) {
			restoreErrors.push(restoreError);
		}
		if (error instanceof Error && restoreErrors.length > 0) {
			(error as Error & { restoreError?: unknown }).restoreError =
				restoreErrors.length === 1
					? restoreErrors[0]
					: new AggregateError(
							restoreErrors,
							"Failed to clean up the Caddy candidate and restore the previous edge",
						);
		}
		throw error;
	}
	if (retained) {
		console.log(`Previous Caddy retained as ${retained.rollbackName} ✅`);
	}
	console.log("Caddy Started ✅");
};

export const initializeStandaloneCaddy = async (
	options: CaddyOptions = {},
	postStartHook?: CaddyPostStartHook,
) =>
	withCaddyConfigLock(options.serverId, () =>
		initializeStandaloneCaddyLockHeld(options, postStartHook),
	);

const initializeCaddyServiceLockHeld = async (
	{
		env,
		additionalPorts = [],
		serverId,
		letsEncryptEmail,
		trustedProxies,
		accessLogs,
	}: CaddyOptions,
	postStartHook?: CaddyPostStartHook,
) => {
	const imageName = CADDY_IMAGE;
	const appName = "dokploy-caddy";
	const { CADDY_CONFIG_PATH, serviceMounts } = getCaddyMounts(serverId);
	const previousConfig = await readCaddyConfigFileIfExists({ serverId });
	const docker = await getRemoteDocker(serverId);
	let existing: Awaited<ReturnType<typeof getExistingService>>;
	let activeService: DockerService | undefined;
	let createdService = false;
	let serviceMutated = false;

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Command: ["caddy", "run", "--config", "/etc/caddy/caddy.json"],
				Env: env,
				Mounts: serviceMounts,
			},
			Networks: [{ Target: DOKPLOY_CADDY_NETWORK }],
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
		UpdateConfig: {
			Parallelism: 1,
			Delay: 0,
			FailureAction: "rollback",
			Monitor: 30_000_000_000,
			MaxFailureRatio: 0,
			Order: "stop-first",
		},
		RollbackConfig: {
			Parallelism: 1,
			Delay: 0,
			FailureAction: "pause",
			Monitor: 30_000_000_000,
			MaxFailureRatio: 0,
			Order: "stop-first",
		},
	};
	try {
		await ensureDefaultCaddyConfig({
			serverId,
			letsEncryptEmail,
			trustedProxies,
			accessLogs,
		});
		await pullImage(docker, imageName);
		await docker.getImage(imageName).inspect();
		await validateCaddyConfigFileWithImage(
			CADDY_CONFIG_PATH,
			serverId,
			imageName,
		);
		await assertActiveUpstreamsReachable(serverId);
		console.log("Caddy service candidate pulled and validated ✅");

		existing = await getExistingService(docker, appName);
		settings.TaskTemplate = {
			...settings.TaskTemplate,
			Networks: mergeServiceNetworks(
				existing?.inspect.Spec?.TaskTemplate?.Networks ?? [],
			),
		};

		if (existing) {
			activeService = existing.service;
			await activeService.update({
				version: existing.inspect.Version.Index,
				...settings,
				TaskTemplate: {
					...settings.TaskTemplate,
					ForceUpdate: existing.inspect.Spec?.TaskTemplate?.ForceUpdate ?? 0,
				},
			});
			serviceMutated = true;
			console.log("Caddy service update accepted ✅");
		} else {
			activeService = await docker.createService(settings);
			createdService = true;
			serviceMutated = true;
			console.log("Caddy service creation accepted ✅");
		}

		await waitForCaddyService(docker, activeService, imageName);
		await validateCaddyConfigWithContainer(serverId);
		if (postStartHook) {
			await postStartHook();
			await waitForCaddyService(docker, activeService, imageName);
		}
		await assertActiveUpstreamsReachable(serverId);
		console.log(existing ? "Caddy Updated ✅" : "Caddy Started ✅");
	} catch (error) {
		const restoreErrors: unknown[] = [];
		try {
			if (previousConfig) {
				await writeCaddyConfigContent(previousConfig, { serverId });
			}
		} catch (restoreError) {
			restoreErrors.push(restoreError);
		}
		try {
			if (createdService && activeService) {
				await activeService.remove();
			} else if (serviceMutated && existing && activeService) {
				await restoreCaddyService(
					docker,
					activeService,
					existing.inspect.Spec as CreateServiceOptions,
				);
			}
		} catch (restoreError) {
			restoreErrors.push(restoreError);
		}
		if (error instanceof Error && restoreErrors.length > 0) {
			(error as Error & { restoreError?: unknown }).restoreError =
				restoreErrors.length === 1
					? restoreErrors[0]
					: new AggregateError(
							restoreErrors,
							"Failed to restore the previous Caddy service",
						);
		}
		throw error;
	}
};

export const initializeCaddyService = async (
	options: CaddyOptions,
	postStartHook?: CaddyPostStartHook,
) =>
	withCaddyConfigLock(options.serverId, () =>
		initializeCaddyServiceLockHeld(options, postStartHook),
	);

export const createDefaultCaddyConfig = async (options: CaddyOptions = {}) => {
	await ensureDefaultCaddyConfig(options);
};

export const validateCaddyConfig = validateCaddyConfigWithContainer;
export const reloadCaddy = reloadCaddyAfterValidation;
