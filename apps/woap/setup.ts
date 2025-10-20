import { exit } from "node:process";
import { execAsync } from "@woap/server";
import { setupDirectories } from "@woap/server/setup/config-paths";
import { initializePostgres } from "@woap/server/setup/postgres-setup";
import { initializeRedis } from "@woap/server/setup/redis-setup";
import {
	initializeNetwork,
	initializeSwarm,
} from "@woap/server/setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeStandaloneTraefik,
} from "@woap/server/setup/traefik-setup";

(async () => {
	try {
		setupDirectories();
		createDefaultMiddlewares();
		await initializeSwarm();
		await initializeNetwork();
		createDefaultTraefikConfig();
		createDefaultServerTraefikConfig();
		await execAsync("docker pull traefik:v3.5.0");
		await initializeStandaloneTraefik();
		await initializeRedis();
		await initializePostgres();
		console.log("Dokploy setup completed");
		exit(0);
	} catch (e) {
		console.error("Error in dokploy setup", e);
	}
})();
