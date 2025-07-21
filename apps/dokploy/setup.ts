import {
	createDefaultMiddlewares,
	createDefaultServerTraefikConfig,
	createDefaultTraefikConfig,
	initializeTraefik,
} from "@dokploy/server/setup/traefik-setup";
import { execAsync } from "@dokploy/server";
import { setupDirectories } from "@dokploy/server/setup/config-paths";
import { initializePostgres } from "@dokploy/server/setup/postgres-setup";
import { initializeRedis } from "@dokploy/server/setup/redis-setup";
import {
	initializeNetwork,
	initializeSwarm,
} from "@dokploy/server/setup/setup";

async function step(actionLabel: string, fn: () => Promise<unknown> | unknown) {
	try {
		await fn();
	} catch (e) {
		console.error(`Error with ${actionLabel}:`, e);
	}
}

async function setup() {
	await step("setting up directories", setupDirectories);
	await step("creating default middlewares", createDefaultMiddlewares);
	await step("initializing swarm", initializeSwarm);
	await step("initializing network", initializeNetwork);
	await step("creating default traefik config", createDefaultTraefikConfig);
	await step(
		"creating default server traefik config",
		createDefaultServerTraefikConfig,
	);
	await step("pulling traefik image v3.1.2", () =>
		execAsync("docker pull traefik:v3.1.2"),
	);
	await step("initializing traefik container", initializeTraefik);
	await step("initializing redis container", initializeRedis);
	await step("initializing postgres container", initializePostgres);
}

setup();
