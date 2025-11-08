import type { Network } from "dockerode";
import { execAsync, execAsyncRemote } from "../process/execAsync";
import { getRemoteDocker } from "../servers/remote-docker";

export interface IPAMConfig {
	Subnet?: string;
	Gateway?: string;
	IPRange?: string;
}

export interface DockerNetworkConfig {
	Name: string;
	Driver: "bridge" | "overlay";
	CheckDuplicate?: boolean;
	Internal?: boolean;
	Attachable?: boolean;
	EnableIPv6?: boolean;
	IPAM?: {
		Config?: IPAMConfig[];
	};
	Labels?: Record<string, string>;
	Options?: Record<string, string>;
}

export const createDockerNetwork = async (
	config: DockerNetworkConfig,
	serverId?: string | null,
): Promise<Network> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const network = await remoteDocker.createNetwork(
			config as Parameters<typeof remoteDocker.createNetwork>[0],
		);
		return network;
	} catch (error) {
		console.error("Error creating Docker network:", error);
		throw error;
	}
};

export const removeDockerNetwork = async (
	networkName: string,
	serverId?: string | null,
): Promise<void> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const network = remoteDocker.getNetwork(networkName);
		await network.remove();
	} catch (error) {
		console.error("Error removing Docker network:", error);
		throw error;
	}
};

export const dockerNetworkExists = async (
	networkName: string,
	serverId?: string | null,
): Promise<boolean> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const network = remoteDocker.getNetwork(networkName);
		await network.inspect();
		return true;
	} catch {
		return false;
	}
};

export const inspectDockerNetwork = async (
	networkName: string,
	serverId?: string | null,
) => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const network = remoteDocker.getNetwork(networkName);
		return await network.inspect();
	} catch (error) {
		console.error("Error inspecting Docker network:", error);
		throw error;
	}
};

export const listDockerNetworks = async (serverId?: string | null) => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		return await remoteDocker.listNetworks();
	} catch (error) {
		console.error("Error listing Docker networks:", error);
		throw error;
	}
};

export const connectContainerToNetwork = async (
	networkName: string,
	containerName: string,
	aliases?: string[],
	serverId?: string | null,
): Promise<void> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const network = remoteDocker.getNetwork(networkName);

		await network.connect({
			Container: containerName,
			EndpointConfig: aliases
				? {
						Aliases: aliases,
					}
				: undefined,
		});
	} catch (error) {
		console.error("Error connecting container to network:", error);
		throw error;
	}
};

export const disconnectContainerFromNetwork = async (
	networkName: string,
	containerName: string,
	serverId?: string | null,
): Promise<void> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const network = remoteDocker.getNetwork(networkName);

		await network.disconnect({
			Container: containerName,
			Force: false,
		});
	} catch (error) {
		console.error("Error disconnecting container from network:", error);
		throw error;
	}
};

export const connectServiceToNetwork = async (
	networkName: string,
	serviceName: string,
	serverId?: string | null,
): Promise<void> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const service = remoteDocker.getService(serviceName);
		const inspect = await service.inspect();

		const currentNetworks = inspect.Spec.TaskTemplate?.Networks || [];
		const alreadyConnected = currentNetworks.some(
			(net: { Target?: string }) => net.Target === networkName,
		);

		if (alreadyConnected) {
			console.log(`Service ${serviceName} already connected to ${networkName}`);
			return;
		}

		const updatedNetworks = [...currentNetworks, { Target: networkName }];

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...inspect.Spec,
			TaskTemplate: {
				...inspect.Spec.TaskTemplate,
				Networks: updatedNetworks,
			},
		});
	} catch (error) {
		console.error("Error connecting service to network:", error);
		throw error;
	}
};

export const disconnectServiceFromNetwork = async (
	networkName: string,
	serviceName: string,
	serverId?: string | null,
): Promise<void> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const service = remoteDocker.getService(serviceName);
		const inspect = await service.inspect();

		let networkId: string | undefined;
		try {
			const network = remoteDocker.getNetwork(networkName);
			const networkInspect = await network.inspect();
			networkId = networkInspect.Id;
		} catch (error) {
			console.warn(`Could not get network ID for ${networkName}:`, error);
		}

		const currentNetworks = inspect.Spec.TaskTemplate?.Networks || [];
		const updatedNetworks = currentNetworks.filter(
			(net: { Target?: string }) => {
				return net.Target !== networkId;
			},
		);

		await service.update({
			version: Number.parseInt(inspect.Version.Index),
			...inspect.Spec,
			TaskTemplate: {
				...inspect.Spec.TaskTemplate,
				Networks: updatedNetworks,
			},
		});
	} catch (error) {
		console.error("Error disconnecting service from network:", error);
		throw error;
	}
};

export const getContainerNetworks = async (
	containerName: string,
	serverId?: string | null,
): Promise<string[]> => {
	try {
		const remoteDocker = await getRemoteDocker(serverId);
		const container = remoteDocker.getContainer(containerName);
		const inspect = await container.inspect();

		return Object.keys(inspect.NetworkSettings.Networks || {});
	} catch (error) {
		console.error("Error getting container networks:", error);
		return [];
	}
};

const connectTraefik = async (
	networkName: string,
	traefikService: string,
	mode: "connect" | "disconnect",
	serverId?: string | null,
): Promise<void> => {
	const networkExists = await dockerNetworkExists(networkName, serverId);
	if (!networkExists) {
		console.warn(`Network ${networkName} does not exist`);
		return;
	}

	try {
		const operation =
			mode === "connect"
				? connectServiceToNetwork
				: disconnectServiceFromNetwork;
		await operation(networkName, traefikService, serverId);
		console.log(
			`Traefik service ${mode === "connect" ? "connected to" : "disconnected from"} network ${networkName}`,
		);
		return;
	} catch (swarmError) {
		console.log("Traefik not running as service, trying container mode");
	}

	try {
		const networks = await getContainerNetworks(traefikService, serverId);
		const isConnected = networks.includes(networkName);

		if (mode === "connect" && isConnected) {
			console.log(`Traefik container already connected to ${networkName}`);
			return;
		}

		if (mode === "disconnect" && !isConnected) {
			console.log(`Traefik container already disconnected from ${networkName}`);
			return;
		}

		if (mode === "connect") {
			await connectContainerToNetwork(
				networkName,
				traefikService,
				[],
				serverId,
			);
		} else {
			await disconnectContainerFromNetwork(
				networkName,
				traefikService,
				serverId,
			);
		}

		console.log(
			`Traefik container ${mode === "connect" ? "connected to" : "disconnected from"} network ${networkName}`,
		);
	} catch (containerError) {
		console.error(
			`Failed to ${mode} Traefik ${mode === "connect" ? "to" : "from"} network:`,
			containerError,
		);
		throw new Error(
			`Could not ${mode} Traefik ${mode === "connect" ? "to" : "from"} network ${networkName}. Ensure Traefik is running.`,
		);
	}
};

export const ensureTraefikConnectedToNetwork = async (
	networkName: string,
	serverId?: string | null,
): Promise<void> => {
	try {
		await connectTraefik(networkName, "dokploy-traefik", "connect", serverId);
	} catch (error) {
		console.error("Error ensuring Traefik network connection:", error);
		throw error;
	}
};

export const ensureTraefikDisconnectedFromNetwork = async (
	networkName: string,
	serverId?: string | null,
): Promise<void> => {
	try {
		await connectTraefik(
			networkName,
			"dokploy-traefik",
			"disconnect",
			serverId,
		);
	} catch (error) {
		console.error("Error ensuring Traefik network disconnection:", error);
		throw error;
	}
};

export const pruneUnusedNetworks = async (
	serverId?: string | null,
): Promise<void> => {
	try {
		const command = "docker network prune --force";

		if (serverId) {
			await execAsyncRemote(serverId, command);
		} else {
			await execAsync(command);
		}

		console.log("Unused Docker networks pruned");
	} catch (error) {
		console.error("Error pruning unused networks:", error);
		throw error;
	}
};
