import { docker } from "../constants";

export const initializeSwarm = async () => {
	const swarmInitialized = await dockerSwarmInitialized();
	if (swarmInitialized) {
		console.log("Swarm is already initialized");
	} else {
		await docker.swarmInit({
			AdvertiseAddr: "127.0.0.1",
			ListenAddr: "0.0.0.0",
		});
		console.log("Swarm was initialized");
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
		console.log("Network is already initialized");
	} else {
		// Awaited so a failure surfaces to the caller (the install script must fail
		// loudly; the server catches and reports it) instead of becoming an
		// unhandled rejection.
		await docker.createNetwork({
			Attachable: true,
			Name: "dokploy-network",
			Driver: "overlay",
		});
		console.log("Network was initialized");
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
