import { randomUUID } from "node:crypto";
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
	CreateServiceOptions,
} from "dockerode";
import { stringify } from "yaml";
import { IS_CLOUD, paths } from "../constants";
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

// Overlapping recreates of one server would remove each other's containers.
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

const recreateStandaloneTraefik = async ({
	env,
	serverId,
	additionalPorts = [],
}: TraefikOptions) => {
	const { MAIN_TRAEFIK_PATH, DYNAMIC_TRAEFIK_PATH } = paths(!!serverId);
	const imageName = `traefik:v${TRAEFIK_VERSION}`;
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
		name: containerName,
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

	const docker = await getRemoteDocker(serverId);
	await restoreBackupTraefik(serverId);
	await ensureTraefikImage(serverId);

	// Kept until the new container stays up, so it can be restored on failure.
	const currentInfo = await docker
		.getContainer(containerName)
		.inspect()
		.catch(() => null);
	const current = currentInfo ? docker.getContainer(currentInfo.Id) : null;
	if (current) {
		await docker
			.getContainer(PREVIOUS_TRAEFIK_CONTAINER)
			.remove({ force: true })
			.catch(() => {});
		await current.rename({ name: PREVIOUS_TRAEFIK_CONTAINER });
		await current.stop().catch(() => {});
		await sleep(5000);
	}

	try {
		const created = await docker.createContainer(settings);
		await created.start();
		await waitUntilStable(created);
	} catch (error) {
		if (!current) {
			console.log("Traefik Not Found: Starting ", error);
			return;
		}
		await docker
			.getContainer(containerName)
			.remove({ force: true })
			.catch(() => {});
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

const PREVIOUS_TRAEFIK_CONTAINER = "dokploy-traefik-previous";
const RESTART_MARKER_CONTAINER = "dokploy-traefik-restarting";
const RESTART_OWNER_LABEL = "dokploy.restart.owner";
const RESTART_MARKER_MAX_AGE_MS = 5 * 60_000;
const PROCESS_ID = randomUUID();

type RemoteDocker = Awaited<ReturnType<typeof getRemoteDocker>>;

// In cloud another Dokploy instance may still be working on this server.
const isActiveElsewhere = (
	markerInfo: {
		Created: string;
		Config?: { Labels?: Record<string, string> };
	} | null,
) =>
	!!markerInfo &&
	markerInfo.Config?.Labels?.[RESTART_OWNER_LABEL] !== PROCESS_ID &&
	Date.now() - Date.parse(markerInfo.Created) < RESTART_MARKER_MAX_AGE_MS;

const runsAsService = (docker: RemoteDocker) =>
	docker
		.getService("dokploy-traefik")
		.inspect()
		.then(
			() => true,
			() => false,
		);

export const restoreInterruptedTraefik = (serverId?: string) =>
	runQueued(serverId, () => restoreBackupTraefik(serverId));

export const queueTraefikTask = (
	serverId: string | undefined,
	task: () => Promise<void>,
) => runQueued(serverId, task);

// Finishes a recreate or restart that a Dokploy restart interrupted.
const restoreBackupTraefik = async (
	serverId?: string,
): Promise<"done" | "busy"> => {
	const docker = await getRemoteDocker(serverId);
	const traefikInfo = await docker
		.getContainer("dokploy-traefik")
		.inspect()
		.catch(() => null);
	const markerInfo = await docker
		.getContainer(RESTART_MARKER_CONTAINER)
		.inspect()
		.catch(() => null);
	if (markerInfo) {
		if (IS_CLOUD && isActiveElsewhere(markerInfo)) {
			return "busy";
		}
		if (traefikInfo && !traefikInfo.State.Running) {
			await docker
				.getContainer(traefikInfo.Id)
				.start()
				.catch(unlessNotModified);
		}
		await docker
			.getContainer(markerInfo.Id)
			.remove({ force: true })
			.catch(unlessNotFound);
	}
	if (traefikInfo || (await runsAsService(docker))) {
		return "done";
	}
	const backupInfo = await docker
		.getContainer(PREVIOUS_TRAEFIK_CONTAINER)
		.inspect()
		.catch(() => null);
	if (!backupInfo) {
		return "done";
	}
	const backup = docker.getContainer(backupInfo.Id);
	await backup.rename({ name: "dokploy-traefik" });
	if (!backupInfo.State.Running) {
		await backup.start();
	}
	console.log("Restored Traefik left behind by an interrupted recreate");
	return "done";
};

const statusCodeOf = (error: unknown) =>
	(error as { statusCode?: number } | null)?.statusCode;

const unlessNotModified = (error: unknown) => {
	if (statusCodeOf(error) !== 304) {
		throw error;
	}
};

const unlessNotFound = (error: unknown) => {
	if (statusCodeOf(error) !== 404) {
		throw error;
	}
};

export const restoreInterruptedTraefikOnServers = async (
	serverIds: string[],
) => {
	const pending = [...serverIds];
	const done: string[] = [];
	const busy: string[] = [];
	const restoreNext = async () => {
		for (let serverId = pending.shift(); serverId; serverId = pending.shift()) {
			const timeout = sleep(60_000).then(() => {
				throw new Error("Timed out after 60 seconds");
			});
			await Promise.race([restoreInterruptedTraefik(serverId), timeout]).then(
				(status) => (status === "busy" ? busy : done).push(serverId),
				(error) => {
					console.error(
						`Failed to restore Traefik on server ${serverId}:`,
						error,
					);
				},
			);
		}
	};
	await Promise.all(
		Array.from({ length: Math.min(4, pending.length) }, restoreNext),
	);
	return { done, busy };
};

export const isTraefikRestartInProgress = async (serverId?: string) => {
	if (!IS_CLOUD) {
		return false;
	}
	const docker = await getRemoteDocker(serverId);
	const markerInfo = await docker
		.getContainer(RESTART_MARKER_CONTAINER)
		.inspect()
		.catch(() => null);
	return isActiveElsewhere(markerInfo);
};

const ALREADY_RESTARTING =
	"Traefik is already being restarted on this server. Try again in a moment.";

const messageOf = (error: unknown) =>
	error instanceof Error ? error.message : String(error);

const startAndCheck = async (traefik: Container) => {
	await traefik.start().catch(unlessNotModified);
	await waitUntilStable(traefik, "Traefik");
};

export const whileTraefikStopped = (
	serverId: string | undefined,
	task: () => Promise<unknown>,
	beforeStop?: () => Promise<unknown>,
) =>
	runQueued(serverId, async () => {
		const docker = await getRemoteDocker(serverId);
		if ((await restoreBackupTraefik(serverId)) === "busy") {
			throw new Error(ALREADY_RESTARTING);
		}
		const info = await docker
			.getContainer("dokploy-traefik")
			.inspect()
			.catch((error) => {
				throw statusCodeOf(error) === 404
					? new Error(
							"The dokploy-traefik container was not found on this server.",
						)
					: error;
			});
		if ((await beforeStop?.()) === false) {
			return;
		}
		if (!info.State.Running) {
			await task();
			return;
		}
		const traefik = docker.getContainer(info.Id);
		// Lets recovery start Traefik if Dokploy dies mid-way.
		const marker = await docker
			.createContainer({
				name: RESTART_MARKER_CONTAINER,
				Image: info.Image,
				Labels: { [RESTART_OWNER_LABEL]: PROCESS_ID },
			})
			.catch((error) => {
				throw statusCodeOf(error) === 409
					? new Error(ALREADY_RESTARTING)
					: error;
			});
		try {
			await traefik.stop().catch(unlessNotModified);
		} catch (error) {
			await marker.remove({ force: true }).catch(() => {});
			throw error;
		}
		const outcome = await task().then(
			(result) => ({
				undo:
					typeof result === "function"
						? (result as () => Promise<void>)
						: undefined,
				failed: false,
				error: undefined as unknown,
			}),
			(error: unknown) => ({ undo: undefined, failed: true, error }),
		);
		const startError = await startAndCheck(traefik).then(
			() => null,
			(error: unknown) => error,
		);
		if (startError) {
			if (!outcome.undo) {
				throw outcome.failed
					? new Error(
							`${messageOf(outcome.error)}. Traefik also did not start again: ${messageOf(startError)}`,
						)
					: startError;
			}
			await traefik.stop().catch(() => {});
			const undoError = await outcome.undo().then(
				() => null,
				(error: unknown) => error,
			);
			const retryError = await startAndCheck(traefik).then(
				() => null,
				(error: unknown) => error,
			);
			if (!retryError) {
				await marker.remove({ force: true }).catch(() => {});
			}
			const steps = [
				messageOf(startError),
				undoError
					? `Undoing the change failed: ${messageOf(undoError)}`
					: "The change was undone",
				retryError
					? `Traefik still did not start: ${messageOf(retryError)}`
					: "Traefik is running again",
			];
			throw new Error(`${steps.join(". ")}.`);
		}
		await marker.remove({ force: true }).catch(() => {});
		if (outcome.failed) {
			throw outcome.error;
		}
	});

// docker.pull resolves before the download ends and reports errors in the stream.
export const ensureTraefikImage = async (serverId?: string) => {
	const imageName = `traefik:v${TRAEFIK_VERSION}`;
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
const waitUntilStable = async (
	container: Container,
	name = "The new Traefik container",
) => {
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
		`${name} stopped right after starting${lastLine ? `: ${lastLine}` : ""}`,
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
	try {
		const service = docker.getService(appName);
		const inspect = await service.inspect();

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...settings,
			TaskTemplate: {
				...settings.TaskTemplate,
				ForceUpdate: inspect.Spec.TaskTemplate.ForceUpdate + 1,
			},
		});
		console.log("Traefik Updated ✅");
	} catch {
		await docker.createService(settings);
		console.log("Traefik Started ✅");
	}
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
