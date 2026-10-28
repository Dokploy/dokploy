import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type Dockerode from "dockerode";
import type {
	Container,
	ContainerCreateOptions,
	ContainerInspectInfo,
	CreateServiceOptions,
	NetworkContainer,
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
// Operators can pin the Traefik container to a fixed address on the
// dokploy-network, so that setups which point at it (split-DNS, firewall
// rules, NAT targets, monitoring) keep working across recreates.
export const TRAEFIK_STATIC_IP = process.env.TRAEFIK_STATIC_IP || "";
export const TRAEFIK_NETWORK_NAME = "dokploy-network";

const STATIC_IP_ENV_KEY = "TRAEFIK_STATIC_IP";
// The Traefik containers keep the address across a recreate, so they must not
// be reported as a conflict with themselves.
const TRAEFIK_CONTAINER_NAMES = ["dokploy-traefik", "dokploy-traefik-previous"];

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

export const readEnvValue = (env: string[] | undefined, key: string) => {
	if (!env) {
		return "";
	}
	const prefix = `${key}=`;
	const entry = env.find((item) => item.startsWith(prefix));
	return entry ? entry.slice(prefix.length).trim() : "";
};

export const isValidIPv4Address = (value: string) => {
	const parts = value.split(".");
	if (parts.length !== 4) {
		return false;
	}
	return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
};

const ipv4ToNumber = (value: string) =>
	value.split(".").reduce((total, part) => total * 256 + Number(part), 0);

export const isAddressInSubnet = (address: string, subnet: string) => {
	const [network, prefixRaw] = subnet.split("/");
	const prefix = Number(prefixRaw);
	if (
		!network ||
		!isValidIPv4Address(network) ||
		!Number.isInteger(prefix) ||
		prefix < 0 ||
		prefix > 32
	) {
		return false;
	}
	const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
	return (ipv4ToNumber(address) & mask) === (ipv4ToNumber(network) & mask);
};

// The env passed by the caller is the source of truth: it is the "Traefik Env"
// setting, so an operator can add or remove the address there. Callers that
// don't pass an env (the startup path) inherit the value from the running
// container, so that a recreate never drops it.
const resolveStaticIp = async (
	docker: Dockerode,
	env: string[] | undefined,
): Promise<string> => {
	if (env) {
		return readEnvValue(env, STATIC_IP_ENV_KEY);
	}
	let current: ContainerInspectInfo | null = null;
	try {
		current = await docker.getContainer("dokploy-traefik").inspect();
	} catch {
		current = null;
	}
	return (
		readEnvValue(current?.Config?.Env, STATIC_IP_ENV_KEY) || TRAEFIK_STATIC_IP
	);
};

// A wrong address fails with Docker's "invalid endpoint settings", which says
// nothing about the cause. Check it upfront and report what is wrong.
const assertStaticIpIsUsable = async (docker: Dockerode, address: string) => {
	if (!isValidIPv4Address(address)) {
		throw new Error(
			`${STATIC_IP_ENV_KEY} "${address}" is not a valid IPv4 address`,
		);
	}
	const network = await docker.getNetwork(TRAEFIK_NETWORK_NAME).inspect();
	const subnet = network.IPAM?.Config?.find(
		(config: { Subnet?: string }) => config.Subnet,
	)?.Subnet;
	if (!subnet) {
		throw new Error(
			`Could not read the subnet of the "${TRAEFIK_NETWORK_NAME}" network`,
		);
	}
	if (!isAddressInSubnet(address, subnet)) {
		throw new Error(
			`${STATIC_IP_ENV_KEY} "${address}" is not inside the "${TRAEFIK_NETWORK_NAME}" subnet (${subnet})`,
		);
	}
	const containers: Record<string, NetworkContainer> = network.Containers ?? {};
	const conflict = Object.values(containers).find(
		(container) =>
			container.IPv4Address?.split("/")[0] === address &&
			!TRAEFIK_CONTAINER_NAMES.includes(container.Name),
	);
	if (conflict) {
		throw new Error(
			`${STATIC_IP_ENV_KEY} "${address}" is already used by the container "${conflict.Name}"`,
		);
	}
};

export const initializeStandaloneTraefik = (options: TraefikOptions = {}) => {
	const key = options.serverId ?? "local";
	const run = (recreateQueue.get(key) ?? Promise.resolve()).then(() =>
		recreateStandaloneTraefik(options),
	);
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

	const docker = await getRemoteDocker(serverId);
	// Restores a container left behind by an interrupted recreate before the
	// address is read, so the value can be inherited from it.
	await restoreInterruptedTraefik(serverId);
	const staticIp = await resolveStaticIp(docker, env);
	if (staticIp) {
		await assertStaticIpIsUsable(docker, staticIp);
	}
	await ensureTraefikImage(serverId);

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
				[TRAEFIK_NETWORK_NAME]: staticIp
					? { IPAMConfig: { IPv4Address: staticIp } }
					: {},
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

// An interrupted recreate (e.g. a Dokploy restart) leaves only the stopped backup.
export const restoreInterruptedTraefik = async (serverId?: string) => {
	const docker = await getRemoteDocker(serverId);
	const exists = await docker
		.getContainer("dokploy-traefik")
		.inspect()
		.then(
			() => true,
			() => false,
		);
	if (exists) {
		return;
	}
	const backupInfo = await docker
		.getContainer(PREVIOUS_TRAEFIK_CONTAINER)
		.inspect()
		.catch(() => null);
	if (!backupInfo) {
		return;
	}
	const backup = docker.getContainer(backupInfo.Id);
	await backup.rename({ name: "dokploy-traefik" });
	if (!backupInfo.State.Running) {
		await backup.start();
	}
	console.log("Restored Traefik left behind by an interrupted recreate");
};

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

	// Swarm assigns an address per task, so there is nothing to pin. Failing
	// loudly is better than silently ignoring the setting.
	const staticIp = readEnvValue(env, STATIC_IP_ENV_KEY) || TRAEFIK_STATIC_IP;
	if (staticIp) {
		throw new Error(`${STATIC_IP_ENV_KEY} is not supported in swarm mode`);
	}

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
