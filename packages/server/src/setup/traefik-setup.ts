import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ContainerCreateOptions } from "dockerode";
import { dump } from "js-yaml";
import { paths } from "../constants";
import { pullImage, pullRemoteImage } from "../utils/docker/utils";
import { getRemoteDocker } from "../utils/servers/remote-docker";
import type { FileConfig } from "../utils/traefik/file-types";
import type { MainTraefikConfig } from "../utils/traefik/types";

export const TRAEFIK_SSL_PORT =
	Number.parseInt(process.env.TRAEFIK_SSL_PORT!, 10) || 443;
export const TRAEFIK_PORT =
	Number.parseInt(process.env.TRAEFIK_PORT!, 10) || 80;
export const TRAEFIK_HTTP3_PORT =
	Number.parseInt(process.env.TRAEFIK_HTTP3_PORT!, 10) || 443;
export const TRAEFIK_VERSION = process.env.TRAEFIK_VERSION || "3.1.2";

interface TraefikOptions {
	enableDashboard?: boolean;
	env?: string[];
	serverId?: string;
	additionalPorts?: {
		targetPort: number;
		publishedPort: number;
		publishMode?: "ingress" | "host";
	}[];
	force?: boolean;
}

export const initializeTraefik = async ({
	enableDashboard = false,
	env,
	serverId,
	additionalPorts = [],
	force = false,
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

	if (enableDashboard) {
		exposedPorts["8080/tcp"] = {};
		portBindings["8080/tcp"] = [{ HostPort: "8080" }];
	}

	for (const port of additionalPorts) {
		const portKey = `${port.targetPort}/tcp`;
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
		if (serverId) {
			await pullRemoteImage(imageName, serverId);
		} else {
			await pullImage(imageName);
		}

		const container = docker.getContainer(containerName);
		try {
			const inspect = await container.inspect();
			if (inspect.State.Status === "running" && !force) {
				console.log("Traefik already running");
				return;
			}

			await container.remove({ force: true });
			console.log("Removed existing container");
		} catch (error) {
			console.log("Traefik Not Found: Starting1 ✅");
			console.log(error);
		}

		await docker.createContainer(settings);
		const newContainer = docker.getContainer(containerName);
		await newContainer.start();

		console.log("Traefik Started ✅");
	} catch (error) {
		console.log("Traefik Not Found: Starting2 ✅", error);
		throw error;
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

	const yamlStr = dump(config);
	mkdirSync(DYNAMIC_TRAEFIK_PATH, { recursive: true });
	writeFileSync(
		path.join(DYNAMIC_TRAEFIK_PATH, `${appName}.yml`),
		yamlStr,
		"utf8",
	);
};

export const getDefaultTraefikConfig = () => {
	const configObject: MainTraefikConfig = {
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

	const yamlStr = dump(configObject);

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

	const yamlStr = dump(configObject);

	return yamlStr;
};

export const createDefaultTraefikConfig = () => {
	const { MAIN_TRAEFIK_PATH, DYNAMIC_TRAEFIK_PATH } = paths();
	const mainConfig = path.join(MAIN_TRAEFIK_PATH, "traefik.yml");
	const acmeJsonPath = path.join(DYNAMIC_TRAEFIK_PATH, "acme.json");

	if (existsSync(acmeJsonPath)) {
		chmodSync(acmeJsonPath, "600");
	}
	if (existsSync(mainConfig)) {
		console.log("Main config already exists");
		return;
	}
	const yamlStr = getDefaultTraefikConfig();
	mkdirSync(MAIN_TRAEFIK_PATH, { recursive: true });
	writeFileSync(mainConfig, yamlStr, "utf8");
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
	const yamlStr = dump(defaultMiddlewares);
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
