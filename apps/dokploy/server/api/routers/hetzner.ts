import {
	fetchHetznerLocations,
	fetchHetznerServers,
	fetchHetznerServerTypes,
} from "@dokploy/server/index";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const hetznerRouter = createTRPCRouter({
	locations: protectedProcedure.query(async () => {
		const locations = await fetchHetznerLocations();
		return locations;
	}),

	serverTypes: protectedProcedure.query(async () => {
		return await fetchHetznerServerTypes();
	}),

	servers: protectedProcedure.query(async () => {
		return await fetchHetznerServers();
	}),
});
