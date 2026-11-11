import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type {
	Container,
	ContainerCreateOptions,
	ContainerInspectInfo,
	CreateServiceOptions,
	default as Docker,
} from "dockerode";
import { stringify } from "yaml";
import { paths } from "../constants";
import { sleep } from "../utils/process/execAsync";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import type { FileConfig } from "../utils/traefik/file-types";
import type { MainTraefikConfig } from "../utils/traefik/types";

export const TRAEFIK_SSL_PORT =
	Number.parseInt(process.env.TRAEFIK_SSL_PORT!, 10) || 443;
export const TRAEFIK_PORT =
	Number.parseInt(process.env.TRAEFIK_PORT!, 10) || 80;
export const TRAEFIK_HTTP3_PORT =
	Number.parseInt(process.env.TRAEFIK_HTTP3_PORT!, 10) || 443;
export const TRAEFIK_VERSION = process.env.TRAEFIK_VERSION || "3.7.16";

export interface TraefikOptions {
	env?: string[];
	serverId?: string;
	additionalPorts?: {
		targetPort: number;
		publishedPort: number;
		protocol?: string;
	}[];
}

// Overlapping recreates and restores of one server would remove each other's containers.
const recreateQueue = new Map<string, Promise<void>>();

export const initializeStandaloneTraefik = (options: TraefikOptions = {}) =>
	runQueued(options.serverId, () => recreateStandaloneTraefik(options));

const runQueued = <T>(serverId: string | undefined, task: () => Promise<T>) => {
	const key = serverId ?? "local";
	const run = (recreateQueue.get(key) ?? Promise.resolve()).then(task);
	// So a hung Docker call can't block later recreates.
	const settled = Promise.race([run.catch(() => {}), sleep(5 * 60_000)]).then(
		() => {},
	);
	recreateQueue.set(key, settled);
	void settled.then(() => {
		if (recreateQueue.get(key) === settled) {
			recreateQueue.delete(key);
		}
	});
	return run;
};

const recreateStandaloneTraefik = async (
	{ env, serverId, additionalPorts = [] }: TraefikOptions,
	previous?: ContainerInspectInfo,
) => {
	const { MAIN_TRAEFIK_PATH, DYNAMIC_TRAEFIK_PATH } = paths(!!serverId);
	const imageName = previous?.Config.Image ?? `traefik:v${TRAEFIK_VERSION}`;
	const containerName = "dokploy-traefik";

	const exposedPorts: Record<string, {}> = {
		[`${TRAEFIK_PORT}/tcp`]: {},
		[`${TRAEFIK_SSL_PORT}/tcp`]: {},
		[`${TRAEFIK_HTTP3_PORT}/udp`]: {},
	};

	const portBindings: Record<string, Array<{ HostPort: string }>> = {
		[`${TRAEFIK_PORT}/tcp`]: [{ HostPort: TRAEFIK_PORT.toString() }],
		[`${TRAEFIK_SSL_PORT}/tcp`]: [{ HostPort: TRAEFIK_SSL_PORT.toString() }],
		[`${TRAEFIK_HTTP3_PORT}/udp`]: [
			{ HostPort: TRAEFIK_HTTP3_PORT.toString() },
		],
	};

	const enableDashboard = additionalPorts.some(
		(port) => port.targetPort === 8080,
	);

	if (enableDashboard) {
		exposedPorts["8080/tcp"] = {};
		portBindings["8080/tcp"] = [{ HostPort: "8080" }];
	}

	for (const port of additionalPorts) {
		const portKey = `${port.targetPort}/${port.protocol ?? "tcp"}`;
		exposedPorts[portKey] = {};
		portBindings[portKey] = [{ HostPort: port.publishedPort.toString() }];
	}

	const settings: ContainerCreateOptions = {
		name: NEXT_TRAEFIK_CONTAINER,
		Image: imageName,
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
			Binds: [
				`${MAIN_TRAEFIK_PATH}/traefik.yml:/etc/traefik/traefik.yml`,
				`${DYNAMIC_TRAEFIK_PATH}:/etc/dokploy/traefik/dynamic`,
				"/var/run/docker.sock:/var/run/docker.sock",
			],
			PortBindings: portBindings,
		},
		Env: env,
	};
	// Recovery must not upgrade Traefik or lose custom ports, mounts, commands or env.
	if (previous) {
		Object.assign(settings, previous.Config, {
			HostConfig: previous.HostConfig,
		});
	}

	const docker = await getRemoteDocker(serverId);
	// A stale endpoint can be replaced here without starting a nested recreate.
	await restoreBackupTraefik(serverId, false);
	await ensureTraefikImage(serverId, imageName);

	// Kept until the new container stays up, so it can be restored on failure.
	const currentInfo = await docker
		.getContainer(containerName)
		.inspect()
		.catch(() => null);
	const current = currentInfo ? docker.getContainer(currentInfo.Id) : null;
	const otherNetworks = Object.entries(
		currentInfo?.NetworkSettings?.Networks ?? {},
	).filter(([name]) => name !== "dokploy-network");

	let created: Container | undefined;
	let movedAside = false;
	try {
		// Created first so an interrupted update can be detected.
		created = await docker.createContainer(settings);
		for (const [, endpoint] of otherNetworks) {
			await docker.getNetwork(endpoint.NetworkID).connect({
				Container: created.id,
				EndpointConfig: { Aliases: endpoint.Aliases },
			});
		}
		if (current) {
			await docker
				.getContainer(PREVIOUS_TRAEFIK_CONTAINER)
				.remove({ force: true })
				.catch(() => {});
			await current.stop().catch(() => {});
			await current.rename({ name: PREVIOUS_TRAEFIK_CONTAINER });
			movedAside = true;
			await sleep(5000);
		}
		await created.rename({ name: containerName });
		await created.start();
		await waitUntilStable(created);
	} catch (error) {
		if (!current) {
			await created?.remove({ force: true }).catch(() => {});
			throw error;
		}
		if (!movedAside) {
			const now = await current.inspect().catch(() => null);
			if (currentInfo?.State.Running && !now?.State.Running) {
				await current.start();
			}
			await created?.remove({ force: true }).catch(() => {});
			throw error;
		}
		await created?.remove({ force: true }).catch(() => {});
		const reason = error instanceof Error ? error.message : String(error);
		try {
			await current.rename({ name: containerName });
			if (currentInfo?.State.Running) {
				await current.start();
			}
		} catch (restoreError) {
			throw new Error(
				`${reason}. Restoring the previous Traefik also failed: ${restoreError instanceof Error ? restoreError.message : restoreError}`,
			);
		}
		throw new Error(`${reason}. The previous Traefik was restored.`);
	}

	await current?.remove({ force: true }).catch(() => {});
	console.log("Traefik Started ✅");
};

const NEXT_TRAEFIK_CONTAINER = "dokploy-traefik-next";
const PREVIOUS_TRAEFIK_CONTAINER = "dokploy-traefik-previous";

export const restoreInterruptedTraefik = (serverId?: string) =>
	runQueued(serverId, () => restoreBackupTraefik(serverId));

const missingDockerResource = (error: unknown) => {
	if ((error as { statusCode?: number })?.statusCode !== 404) {
		throw error;
	}
	return null;
};

// Shares the recreate lock so the startup/periodic check cannot interrupt an update.
export const ensureTraefikRunning = (serverId?: string, reload = false) =>
	runQueued(serverId, async () => {
		const docker = await getRemoteDocker(serverId);
		const service = await docker
			.getService("dokploy-traefik")
			.inspect()
			.catch(async (error) => {
				// Service APIs are unavailable on workers and non-Swarm servers.
				if (error.statusCode === 503) {
					const swarm = (await docker.info()).Swarm;
					if (
						swarm?.LocalNodeState === "inactive" ||
						swarm?.ControlAvailable === false
					)
						return null;
				}
				return missingDockerResource(error);
			});
		if (service) {
			if (reload) {
				const forceUpdate = (service.Spec.TaskTemplate.ForceUpdate ?? 0) + 1;
				await docker.getService("dokploy-traefik").update({
					...service.Spec,
					version: service.Version.Index,
					TaskTemplate: {
						...service.Spec.TaskTemplate,
						ForceUpdate: forceUpdate,
					},
				});
				await waitForTraefikService(docker, forceUpdate);
				return false;
			}
			return null;
		}
		await restoreBackupTraefik(serverId);
		const container = docker.getContainer("dokploy-traefik");
		const info = await container.inspect().catch(missingDockerResource);
		if (info?.State.Running && !reload) return false;
		// Paused/restarting containers are still managed by Docker; leave them alone.
		if (info?.State.Paused || info?.State.Restarting) return false;
		// Never replace a container merely because Docker or the overlay is unavailable.
		await docker.getNetwork("dokploy-network").inspect();
		if (info) {
			if (
				await startTraefikContainer(container, info, serverId, {
					restart: reload && info.State.Running,
				})
			)
				return true;
			await waitUntilStable(container);
		} else {
			await recreateStandaloneTraefik({ serverId });
		}
		return true;
	});

const startTraefikContainer = async (
	container: Container,
	info: ContainerInspectInfo,
	serverId?: string,
	{ restart = false, repairNetwork = true } = {},
) => {
	try {
		if (restart) await container.restart();
		else await container.start();
		return false;
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		if (
			!/attaching to network failed|network .*not found|could not find a network|IPAM.*address already in use/i.test(
				reason,
			)
		)
			throw error;
		if (!repairNetwork) return false;
		const docker = await getRemoteDocker(serverId);
		await docker.getNetwork("dokploy-network").inspect();
		await recreateStandaloneTraefik({ serverId }, info);
		return true;
	}
};

// ForceUpdate is asynchronous: old running tasks do not prove a reload succeeded.
const waitForTraefikService = async (docker: Docker, forceUpdate: number) => {
	const deadline = Date.now() + 60_000;
	let stableTasks = "";
	let stableSince = Date.now();
	let lastState = "waiting for a replacement task";
	while (true) {
		const service = await docker.getService("dokploy-traefik").inspect();
		const update = service.UpdateStatus;
		if (update?.State === "paused" || update?.State?.startsWith("rollback")) {
			throw new Error(
				`Traefik reload failed: ${update.Message || update.State}`,
			);
		}
		const tasks = await docker.listTasks({
			filters: JSON.stringify({ service: ["dokploy-traefik"] }),
		});
		const replacements = tasks.filter(
			(task) => (task.Spec?.ForceUpdate ?? 0) === forceUpdate,
		);
		const failed = replacements.find((task) =>
			["failed", "rejected"].includes(task.Status?.State ?? ""),
		);
		if (failed) {
			throw new Error(
				`Traefik reload failed: ${failed.Status?.Err || failed.Status?.State}`,
			);
		}
		const desired = replacements.filter(
			(task) => task.DesiredState === "running",
		);
		const replicas = service.Spec.Mode?.Replicated?.Replicas ?? 1;
		const running = desired.filter((task) => task.Status?.State === "running");
		const ids = running
			.map((task) => task.ID)
			.sort()
			.join(",");
		if (
			replicas > 0 &&
			running.length >= replicas &&
			running.length === desired.length
		) {
			if (ids !== stableTasks) {
				stableTasks = ids;
				stableSince = Date.now();
			} else if (Date.now() - stableSince >= 5000) {
				return;
			}
		} else {
			stableTasks = "";
		}
		lastState =
			desired[0]?.Status?.Err || desired[0]?.Status?.State || lastState;
		if (Date.now() >= deadline) {
			throw new Error(
				`Timed out waiting for the replacement Traefik task: ${lastState}`,
			);
		}
		await sleep(500);
	}
};

// Undoes an update interrupted by a Dokploy restart.
const restoreBackupTraefik = async (
	serverId?: string,
	repairNetwork = true,
) => {
	const docker = await getRemoteDocker(serverId);
	const inspect = (name: string) =>
		docker
			.getContainer(name)
			.inspect()
			.catch(() => null);
	const nextInfo = await inspect(NEXT_TRAEFIK_CONTAINER);
	const backupInfo = await inspect(PREVIOUS_TRAEFIK_CONTAINER);
	if (!nextInfo && !backupInfo) {
		return;
	}
	let currentInfo = await inspect("dokploy-traefik");
	if (currentInfo?.State.Status === "created" && backupInfo) {
		await docker.getContainer(currentInfo.Id).remove({ force: true });
		currentInfo = null;
	}
	// Clear the interrupted candidate before a start can enter network repair.
	if (nextInfo) {
		await docker.getContainer(nextInfo.Id).remove({ force: true });
	}
	if (currentInfo) {
		if (nextInfo && !currentInfo.State.Running) {
			await startTraefikContainer(
				docker.getContainer(currentInfo.Id),
				currentInfo,
				serverId,
				{ repairNetwork },
			);
		}
	} else if (backupInfo) {
		const backup = docker.getContainer(backupInfo.Id);
		if (backupInfo.State.Running) {
			await backup.stop().catch(() => {});
		}
		try {
			await backup.rename({ name: "dokploy-traefik" });
		} catch (error) {
			// Preserve a running backup if Docker could not restore its name.
			await backup.start();
			throw error;
		}
		await startTraefikContainer(backup, backupInfo, serverId, {
			repairNetwork,
		});
		console.log("Restored Traefik left behind by an interrupted recreate");
	}
};

// docker.pull resolves before the download ends and reports errors in the stream.
export const ensureTraefikImage = async (
	serverId?: string,
	imageName = `traefik:v${TRAEFIK_VERSION}`,
) => {
	const docker = await getRemoteDocker(serverId);
	const image = docker.getImage(imageName);
	if (
		await image.inspect().then(
			() => true,
			() => false,
		)
	) {
		return;
	}
	const stream = await docker.pull(imageName);
	await new Promise<void>((resolve, reject) => {
		docker.modem.followProgress(
			stream,
			(error: Error | null, events: { error?: string }[] = []) => {
				const failed = events.find((event) => event.error);
				if (error || failed) {
					reject(error ?? new Error(failed?.error));
				} else {
					resolve();
				}
			},
		);
	});
	await image.inspect();
};

// restart: always hides a container that exits on start.
const waitUntilStable = async (container: Container) => {
	await sleep(3000);
	const first = await container.inspect();
	await sleep(2000);
	const second = await container.inspect();
	if (
		second.State.Running &&
		second.State.StartedAt === first.State.StartedAt
	) {
		return;
	}
	const logs = await container
		.logs({ stdout: true, stderr: true, tail: 5 })
		.catch(() => null);
	const lastLine = logs ? lastLogLine(logs) : "";
	throw new Error(
		`The new Traefik container stopped right after starting${lastLine ? `: ${lastLine}` : ""}`,
	);
};

const ANSI_COLOR = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");

// Non-TTY container logs come in frames with an 8-byte header.
export const lastLogLine = (logs: Buffer) => {
	let text = "";
	for (let offset = 0; offset + 8 <= logs.length; ) {
		const size = logs.readUInt32BE(offset + 4);
		text += logs.subarray(offset + 8, offset + 8 + size).toString();
		offset += 8 + size;
	}
	const lines = text.replace(ANSI_COLOR, "").trim().split("\n");
	return (lines.at(-1) ?? "").trim().slice(0, 300);
};

export const initializeTraefikService = async ({
	env,
	additionalPorts = [],
	serverId,
}: TraefikOptions) => {
	const { MAIN_TRAEFIK_PATH, DYNAMIC_TRAEFIK_PATH } = paths(!!serverId);
	const imageName = `traefik:v${TRAEFIK_VERSION}`;
	const appName = "dokploy-traefik";

	const settings: CreateServiceOptions = {
		Name: appName,
		TaskTemplate: {
			ContainerSpec: {
				Image: imageName,
				Env: env,
				Mounts: [
					{
						Type: "bind",
						Source: `${MAIN_TRAEFIK_PATH}/traefik.yml`,
						Target: "/etc/traefik/traefik.yml",
					},
					{
						Type: "bind",
						Source: DYNAMIC_TRAEFIK_PATH,
						Target: "/etc/dokploy/traefik/dynamic",
					},
					{
						Type: "bind",
						Source: "/var/run/docker.sock",
						Target: "/var/run/docker.sock",
					},
				],
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
			Ports: [
				{
					TargetPort: 443,
					PublishedPort: TRAEFIK_SSL_PORT,
					PublishMode: "host",
					Protocol: "tcp",
				},
				{
					TargetPort: 443,
					PublishedPort: TRAEFIK_SSL_PORT,
					PublishMode: "host",
					Protocol: "udp",
				},
				{
					TargetPort: 80,
					PublishedPort: TRAEFIK_PORT,
					PublishMode: "host",
					Protocol: "tcp",
				},

				...additionalPorts.map((port) => ({
					TargetPort: port.targetPort,
					PublishedPort: port.publishedPort,
					Protocol: port.protocol as "tcp" | "udp" | "sctp" | undefined,
					PublishMode: "host" as const,
				})),
			],
		},
	};
	const docker = await getRemoteDocker(serverId);
	let forceUpdate = 0;
	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();
		forceUpdate = (inspect.Spec.TaskTemplate.ForceUpdate ?? 0) + 1;

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: forceUpdate,
			},
		});
		console.log("Traefik Updated ✅");
	} catch {
		await docker.createService(settings);
		console.log("Traefik Started ✅");
	}
	await waitForTraefikService(docker, forceUpdate);
};

export const createDefaultServerTraefikConfig = () => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const configFilePath = path.join(DYNAMIC_TRAEFIK_PATH, "dokploy.yml");

	if (existsSync(configFilePath)) {
		console.log("Default traefik config already exists");
		return;
	}

	const appName = "dokploy";
	const serviceURLDefault = `http://${appName}:${process.env.PORT || 3000}`;
	const config: FileConfig = {
		http: {
			routers: {
				[`${appName}-router-app`]: {
					rule: `Host(\`${appName}.docker.localhost\`) && PathPrefix(\`/\`)`,
					service: `${appName}-service-app`,
					entryPoints: ["web"],
				},
			},
			services: {
				[`${appName}-service-app`]: {
					loadBalancer: {
						servers: [{ url: serviceURLDefault }],
						passHostHeader: true,
					},
				},
			},
		},
	};

	const yamlStr = stringify(config);
	mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
	writeFileSync(
		path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`),
		yamlStr,
		"utf8",
	);
};

export const getDefaultTraefikConfig = () => {
	const configObject: MainTraefikConfig = {
		global: {
			sendAnonymousUsage: false,
		},
		providers: {
			...(process.env.NODE_ENV === "development"
				? {
						docker: {
							defaultRule:
								"Host(`{{ trimPrefix `/` .Name }}.docker.localhost`)",
						},
					}
				: {
						swarm: {
							exposedByDefault: false,
							watch: true,
						},
						docker: {
							exposedByDefault: false,
							watch: true,
							network: "dokploy-network",
						},
					}),
			file: {
				directory: "/etc/dokploy/traefik/dynamic",
				watch: true,
			},
		},
		entryPoints: {
			web: {
				address: `:${TRAEFIK_PORT}`,
			},
			websecure: {
				address: `:${TRAEFIK_SSL_PORT}`,
				http3: {
					advertisedPort: TRAEFIK_HTTP3_PORT,
				},
				...(process.env.NODE_ENV === "production" && {
					http: {
						tls: {
							certResolver: "letsencrypt",
						},
					},
				}),
			},
		},
		api: {
			insecure: true,
		},
		...(process.env.NODE_ENV === "production" && {
			certificatesResolvers: {
				letsencrypt: {
					acme: {
						email: "test@localhost.com",
						storage: "/etc/dokploy/traefik/dynamic/acme.json",
						httpChallenge: {
							entryPoint: "web",
						},
					},
				},
			},
		}),
	};

	const yamlStr = stringify(configObject);

	return yamlStr;
};

export const getDefaultServerTraefikConfig = (withSwarmProvider = true) => {
	const configObject: MainTraefikConfig = {
		providers: {
			...(withSwarmProvider && {
				swarm: {
					exposedByDefault: false,
					watch: true,
				},
			}),
			docker: {
				exposedByDefault: false,
				watch: true,
				network: "dokploy-network",
			},
			file: {
				directory: "/etc/dokploy/traefik/dynamic",
				watch: true,
			},
		},
		entryPoints: {
			web: {
				address: `:${TRAEFIK_PORT}`,
			},
			websecure: {
				address: `:${TRAEFIK_SSL_PORT}`,
				http3: {
					advertisedPort: TRAEFIK_HTTP3_PORT,
				},
				http: {
					tls: {
						certResolver: "letsencrypt",
					},
				},
			},
		},
		api: {
			insecure: true,
		},
		certificatesResolvers: {
			letsencrypt: {
				acme: {
					email: "test@localhost.com",
					storage: "/etc/dokploy/traefik/dynamic/acme.json",
					httpChallenge: {
						entryPoint: "web",
					},
				},
			},
		},
	};

	const yamlStr = stringify(configObject);

	return yamlStr;
};

export const createDefaultTraefikConfig = () => {
	const { MAIN_TRAEFIK_PATH, DYNAMIC_TRAEFIK_PATH } = paths();
	const mainConfig = path.join(MAIN_TRAEFIK_PATH, "traefik.yml");
	const acmeJsonPath = path.join(DYNAMIC_TRAEFIK_PATH, "acme.json");

	if (existsSync(acmeJsonPath)) {
		chmodSync(acmeJsonPath, "600");
	}

	// Create the traefik directory first
	mkdirSync(MAIN_TRAEFIK_PATH, { recursive: true });

	// Check if traefik.yml exists and handle the case where it might be a directory
	if (existsSync(mainConfig)) {
		const stats = statSync(mainConfig);
		if (stats.isDirectory()) {
			// If traefik.yml is a directory, remove it
			console.log("Found traefik.yml as directory, removing it...");
			rmSync(mainConfig, { recursive: true, force: true });
		} else if (stats.isFile()) {
			console.log("Main config already exists");
			return;
		}
	}

	const yamlStr = getDefaultTraefikConfig();
	writeFileSync(mainConfig, yamlStr, "utf8");
	console.log("Traefik config created successfully");
};

export const getDefaultMiddlewares = () => {
	const defaultMiddlewares = {
		http: {
			middlewares: {
				"redirect-to-https": {
					redirectScheme: {
						scheme: "https",
						permanent: true,
					},
				},
			},
		},
	};
	const yamlStr = stringify(defaultMiddlewares);
	return yamlStr;
};
export const createDefaultMiddlewares = () => {
	const { DYNAMIC_TRAEFIK_PATH } = paths();
	const middlewaresPath = path.join(DYNAMIC_TRAEFIK_PATH, "middlewares.yml");
	if (existsSync(middlewaresPath)) {
		console.log("Default middlewares already exists");
		return;
	}
	const yamlStr = getDefaultMiddlewares();
	mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
	writeFileSync(middlewaresPath, yamlStr, "utf8");
};
