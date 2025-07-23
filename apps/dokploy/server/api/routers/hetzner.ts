import {
	fetchHetznerLocations,
	fetchHetznerServerTypes,
	fetchHetznerServers,
} from "@dokploy/server/index";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const hetznerRouter = createTRPCRouter({
	locations: protectedProcedure.query(async () => {
		const apiKey = process.env.HETZNER_API_KEY;
		if (!apiKey) {
			throw new Error("Hetzner API key not configured");
		}
		return await fetchHetznerLocations(apiKey);
	}),

	serverTypes: protectedProcedure.query(async () => {
		const apiKey = process.env.HETZNER_API_KEY;
		if (!apiKey) {
			throw new Error("Hetzner API key not configured");
		}
		return await fetchHetznerServerTypes(apiKey);
	}),

	servers: protectedProcedure.query(async () => {
		const apiKey = process.env.HETZNER_API_KEY;
		if (!apiKey) {
			throw new Error("Hetzner API key not configured");
		}
		return await fetchHetznerServers(apiKey);
	}),
});
