import { docker, dockerSwarmInitialized } from "@dokploy/server";

const ignoreNotFound = async (action: () => Promise<unknown>) => {
	try {
		await action();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
};

const removeDevelopmentResources = async () => {
	await ignoreNotFound(() =>
		docker.getContainer("dokploy-traefik").remove({ force: true }),
	);
	console.log("Dokploy Traefik removed ✅");

	await ignoreNotFound(() => docker.getService("dokploy-postgres").remove());
	console.log("Dokploy Postgres service removed ✅");

	await ignoreNotFound(() => docker.getVolume("dokploy-postgres").remove());
	console.log("Dokploy Postgres data volume removed ✅");

	await ignoreNotFound(() => docker.getNetwork("dokploy-network").remove());
	console.log("Dokploy network removed ✅");
};

(async () => {
	try {
		await removeDevelopmentResources();

		if (await dockerSwarmInitialized()) {
			await docker.swarmLeave({ force: true });
			console.log("Docker Swarm left ✅");
		}

		console.log("Dokploy development environment removed");
	} catch (error) {
		console.error("Error removing Dokploy development environment", error);
		process.exitCode = 1;
	}
})();
