import { exit } from "node:process";
import { docker } from "@dokploy/server/constants";

const SWARM_SERVICES = ["dokploy-postgres", "dokploy-redis"];
const STANDALONE_CONTAINERS = ["dokploy-traefik"];
const NETWORK_NAME = "dokploy-network";

const removeSwarmService = async (name: string) => {
	try {
		await docker.getService(name).remove();
		console.log(`Removed service ${name}`);
	} catch (error: any) {
		if (error?.statusCode === 404) {
			console.log(`Service ${name} not running`);
			return;
		}
		console.warn(`Failed to remove service ${name}:`, error?.message ?? error);
	}
};

const removeContainer = async (name: string) => {
	try {
		await docker.getContainer(name).remove({ force: true });
		console.log(`Removed container ${name}`);
	} catch (error: any) {
		if (error?.statusCode === 404) {
			console.log(`Container ${name} not running`);
			return;
		}
		console.warn(
			`Failed to remove container ${name}:`,
			error?.message ?? error,
		);
	}
};

const removeNetwork = async (name: string) => {
	try {
		await docker.getNetwork(name).remove();
		console.log(`Removed network ${name}`);
	} catch (error: any) {
		if (error?.statusCode === 404) {
			console.log(`Network ${name} not found`);
			return;
		}
		if (error?.statusCode === 403) {
			console.log(`Network ${name} still in use, skipping`);
			return;
		}
		console.warn(`Failed to remove network ${name}:`, error?.message ?? error);
	}
};

(async () => {
	try {
		for (const service of SWARM_SERVICES) {
			await removeSwarmService(service);
		}
		for (const container of STANDALONE_CONTAINERS) {
			await removeContainer(container);
		}
		await removeNetwork(NETWORK_NAME);
		console.log("Dokploy teardown completed");
		exit(0);
	} catch (error) {
		console.error("Error in dokploy teardown", error);
		exit(1);
	}
})();
