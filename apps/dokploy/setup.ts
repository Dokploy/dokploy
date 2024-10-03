import {
	setupDirectories,
	initializePostgres,
	initializeRedis,
	initializeNetwork,
	initializeSwarm,
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeTraefik,
} from "@dokploy/builders";

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
