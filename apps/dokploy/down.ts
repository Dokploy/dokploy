import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { docker, paths } from "@dokploy/server/constants";

const ignoreNotFound = async (action: () => Promise<unknown>) => {
	try {
		await action();
	} catch (error: any) {
		if (error?.statusCode !== 404) {
			throw error;
		}
	}
};

const removeStandaloneResources = async () => {
	await ignoreNotFound(() =>
		docker.getContainer("dokploy-traefik").remove({ force: true }),
	);
	console.log("Dokploy Traefik removed ✅");
};

const removeSwarmResources = async () => {
	await ignoreNotFound(() => docker.getService("dokploy-postgres").remove());
	console.log("Dokploy Postgres service removed ✅");

	await ignoreNotFound(() => docker.getVolume("dokploy-postgres").remove());
	console.log("Dokploy Postgres data volume removed ✅");
};

const swarmMarkerPath = join(paths().BASE_PATH, ".dokploy-dev-swarm");

const getSwarmId = async () => {
	try {
		return (await docker.swarmInspect()).ID;
	} catch {
		return undefined;
	}
};

(async () => {
	try {
		await removeStandaloneResources();
		const swarmId = await getSwarmId();
		const markedSwarmId = existsSync(swarmMarkerPath)
			? readFileSync(swarmMarkerPath, "utf8").trim()
			: undefined;

		if (swarmId && markedSwarmId === swarmId) {
			await removeSwarmResources();
			await docker.swarmLeave({ force: true });
			console.log("Docker Swarm left ✅");

			await ignoreNotFound(() => docker.getNetwork("dokploy-network").remove());
			console.log("Dokploy network removed ✅");
			rmSync(swarmMarkerPath, { force: true });
		} else if (swarmId) {
			console.log(
				"Docker Swarm was not initialized by Dokploy; leaving it unchanged",
			);
		} else {
			console.log("Docker Swarm is already inactive; skipping Swarm resources");
			rmSync(swarmMarkerPath, { force: true });
		}

		console.log("Dokploy development environment removed");
	} catch (error) {
		console.error("Error removing Dokploy development environment", error);
		process.exitCode = 1;
	}
})();
