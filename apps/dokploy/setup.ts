import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeTraefik,
} from "@dokploy/server";

import { setupDirectories } from "@dokploy/server";
import { initializePostgres } from "@dokploy/server";
import { initializeRedis } from "@dokploy/server";
import { initializeNetwork, initializeSwarm } from "@dokploy/server";
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
