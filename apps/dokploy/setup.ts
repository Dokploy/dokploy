import { exec } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { exit } from "node:process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

import { docker, paths } from "@dokploy/server/constants";
import { setupDirectories } from "@dokploy/server/setup/config-paths";
import { initializePostgres } from "@dokploy/server/setup/postgres-setup";
import {
	initializeNetwork,
	initializeSwarm,
} from "@dokploy/server/setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeStandaloneTraefik,
	TRAEFIK_VERSION,
} from "@dokploy/server/setup/traefik-setup";

(async () => {
	try {
		setupDirectories();
		createDefaultMiddlewares();
		const swarmWasInitialized = await initializeSwarm();
		if (swarmWasInitialized) {
			const swarm = await docker.swarmInspect();
			writeFileSync(join(paths().BASE_PATH, ".dokploy-dev-swarm"), swarm.ID);
		}
		await initializeNetwork();
		createDefaultTraefikConfig();
		createDefaultServerTraefikConfig();
		await execAsync(`docker pull traefik:v${TRAEFIK_VERSION}`);
		await initializeStandaloneTraefik();
		await initializePostgres();
		console.log("Dokploy setup completed");
		exit(0);
	} catch (e) {
		console.error("Error in dokploy setup", e);
	}
})();
