import {
	chmodSync,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import path from "node:path";
import type { ContainerCreateOptions, CreateServiceOptions } from "dockerode";
import { parse, stringify } from "yaml";
import { paths } from "../constants";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import type {
	FileConfig,
	HttpMiddleware,
	HttpRouter,
} from "../utils/traefik/file-types";
import type { MainTraefikConfig } from "../utils/traefik/types";

export const TRAEFIK_SSL_PORT =
	Number.parseInt(process.env.TRAEFIK_SSL_PORT!, 10) || 443;
export const TRAEFIK_PORT =
	Number.parseInt(process.env.TRAEFIK_PORT!, 10) || 80;
export const TRAEFIK_HTTP3_PORT =
	Number.parseInt(process.env.TRAEFIK_HTTP3_PORT!, 10) || 443;
export const TRAEFIK_VERSION = process.env.TRAEFIK_VERSION || "3.6.25";

export interface TraefikOptions {
	env?: string[];
	serverId?: string;
	additionalPorts?: {
		targetPort: number;
		publishedPort: number;
		protocol?: string;
	}[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export const initializeStandaloneTraefik = async ({
	env,
	serverId,
	additionalPorts = [],
}: TraefikOptions = {}) => {
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
	try {
		await docker.pull(imageName);
		await new Promise((resolve) => setTimeout(resolve, 3000));
		console.log("Traefik Image Pulled ✅");
	} catch (error) {
		console.log("Traefik Image Not Found: Pulling ", error);
	}
	try {
		const container = docker.getContainer(containerName);
		await container.remove({ force: true });
		await new Promise((resolve) => setTimeout(resolve, 5000));
	} catch {}

	try {
		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();
		console.log("Traefik Started ✅");
	} catch (error) {
		console.log("Traefik Not Found: Starting ", error);
	}
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
	const appName = "dokploy";
	const routerName = `${appName}-router-app`;
	const middlewareName = `${appName}-local-access`;
	const defaultRule = `Host(\`${appName}.docker.localhost\`) && PathPrefix(\`/\`)`;
	const fallbackHostRule = `Host(\`${appName}.docker.localhost\`)`;
	const isFallbackRule = (rule: unknown) =>
		rule === defaultRule || rule === fallbackHostRule;
	const serviceURLDefault = `http://${appName}:${process.env.PORT || 3000}`;
	const defaultRouter: HttpRouter = {
		rule: defaultRule,
		service: `${appName}-service-app`,
		entryPoints: ["web"],
		middlewares: [middlewareName],
	};
	const localAccessMiddleware: HttpMiddleware = {
		ipAllowList: {
			sourceRange: [
				"127.0.0.1/32",
				"10.0.0.0/8",
				"172.16.0.0/12",
				"192.168.0.0/16",
			],
		},
	};
	const config: FileConfig = {
		http: {
			routers: {
				[routerName]: defaultRouter,
			},
			middlewares: {
				[middlewareName]: localAccessMiddleware,
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

	if (existsSync(configFilePath)) {
		let existingConfig: FileConfig;
		try {
			if (!statSync(configFilePath).isFile()) {
				console.error(
					`Default traefik config path is not a file: ${configFilePath}; migration skipped`,
				);
				return;
			}
			const parsedConfig = parse(readFileSync(configFilePath, "utf8"));
			if (!isObject(parsedConfig)) {
				console.error(
					`Default traefik config at ${configFilePath} is not a YAML object; migration skipped`,
				);
				return;
			}
			existingConfig = parsedConfig as FileConfig;
		} catch (error) {
			console.error(
				`Default traefik config at ${configFilePath} is unreadable or unparseable; migration skipped`,
				error,
			);
			// Do not overwrite an unreadable or unparseable config and risk losing operator changes.
			return;
		}

		if (
			!isObject(existingConfig.http) ||
			!isObject(existingConfig.http.routers)
		) {
			console.error(
				`Default traefik config at ${configFilePath} has no HTTP routers; migration skipped`,
			);
			return;
		}
		if (
			existingConfig.http.middlewares !== undefined &&
			!isObject(existingConfig.http.middlewares)
		) {
			console.error(
				`Default traefik config at ${configFilePath} has invalid HTTP middlewares; migration skipped`,
			);
			return;
		}

		const existingHttp = existingConfig.http;
		const existingRouters = existingHttp.routers as Record<string, HttpRouter>;
		const existingRouter = existingRouters[routerName];
		if (!isObject(existingRouter)) {
			console.error(
				`Default router not found in ${configFilePath}; migration skipped`,
			);
			return;
		}
		if (
			existingRouter.middlewares !== undefined &&
			!Array.isArray(existingRouter.middlewares)
		) {
			console.error(
				`Default router in ${configFilePath} has invalid middlewares; migration skipped`,
			);
			return;
		}

		if (!isFallbackRule(existingRouter.rule)) {
			console.log(
				"Custom domain detected on dokploy-router-app, skipping local-access migration",
			);
			return;
		}

		existingHttp.middlewares = existingHttp.middlewares || {};
		existingRouters[routerName] = {
			...defaultRouter,
			...existingRouter,
			middlewares: existingRouter.middlewares?.includes(middlewareName)
				? existingRouter.middlewares
				: [...(existingRouter.middlewares || []), middlewareName],
		};
		existingHttp.middlewares[middlewareName] = localAccessMiddleware;

		const secureRouterName = `${routerName}-secure`;
		const existingSecureRouter = existingRouters[secureRouterName];
		if (
			isObject(existingSecureRouter) &&
			isFallbackRule(existingSecureRouter.rule) &&
			(existingSecureRouter.middlewares === undefined ||
				Array.isArray(existingSecureRouter.middlewares))
		) {
			existingRouters[secureRouterName] = {
				...existingSecureRouter,
				middlewares: existingSecureRouter.middlewares?.includes(middlewareName)
					? existingSecureRouter.middlewares
					: [...(existingSecureRouter.middlewares || []), middlewareName],
			};
		}

		console.log(
			"Migrating default traefik config to add local-access allowlist",
		);
		const temporaryConfigFilePath = `${configFilePath}.tmp`;
		try {
			writeFileSync(temporaryConfigFilePath, stringify(existingConfig), "utf8");
			renameSync(temporaryConfigFilePath, configFilePath);
		} catch (error) {
			console.error(
				`Unable to write migrated default traefik config at ${configFilePath}; migration skipped`,
				error,
			);
			// Write to a temporary file first so a failed migration cannot truncate the original config.
		}
		// Callers invoke this synchronously; setup is a one-shot provisioning command before server bootstrap.
		return;
	}

	const yamlStr = stringify(config);
	try {
		mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
		writeFileSync(configFilePath, yamlStr, "utf8");
	} catch (error) {
		console.error(
			`Unable to create default traefik config at ${configFilePath}`,
			error,
		);
		// A filesystem error must not turn a missing default route into a startup outage.
	}
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

export const getDefaultServerTraefikConfig = () => {
	const configObject: MainTraefikConfig = {
		providers: {
			swarm: {
				exposedByDefault: false,
				watch: true,
			},
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
