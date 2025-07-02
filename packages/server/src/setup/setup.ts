import { docker } from "../constants";

export const initializeSwarm = async () => {
	const swarmInitialized = await dockerSwarmInitialized();
	if (swarmInitialized) {
		console.log("Swarm is already initilized");
	} else {
		await docker.swarmInit({
			AdvertiseAddr: "127.0.0.1",
			ListenAddr: "0.0.0.0",
		});
		console.log("Swarm was initilized");
	}
};

export const dockerSwarmInitialized = async () => {
	try {
		await docker.swarmInspect();

		return true;
	} catch {
		return false;
	}
};

export const initializeNetwork = async () => {
	const networkInitialized = await dockerNetworkInitialized();
	if (networkInitialized) {
		console.log("Network is already initilized");
	} else {
		docker.createNetwork({
			Attachable: true,
			Name: "dokploy-network",
			Driver: "overlay",
		});
		console.log("Network was initilized");
	}
};

export const dockerNetworkInitialized = async () => {
	try {
		await docker.getNetwork("dokploy-network").inspect();
		return true;
	} catch {
		return false;
	}
};
