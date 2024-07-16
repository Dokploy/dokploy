import { setupDirectories } from "./server/setup/config-paths";
import { initializePostgres } from "./server/setup/postgres-setup";
import { initializeRedis } from "./server/setup/redis-setup";
import { initializeNetwork, initializeSwarm } from "./server/setup/setup";
import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeTraefik,
} from "./server/setup/traefik-setup";

(async () => {
	try {
		setupDirectories();
		createDefaultMiddlewares();
		await initializeSwarm();
		await initializeNetwork();
		createDefaultTraefikConfig();
		createDefaultServerTraefikConfig();
		await initializeTraefik();
		await initializeRedis();
		await initializePostgres();
	} catch (e) {
		console.error("Error to setup dokploy", e);
	}
})();
