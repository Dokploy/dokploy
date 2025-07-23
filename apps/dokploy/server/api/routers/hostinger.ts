import {
	fetchHostingerCatalog,
	fetchHostingerDataCenters,
	fetchHostingerServers,
} from "@dokploy/server/index";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const hostingerRouter = createTRPCRouter({
	vpsPlans: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			throw new Error("Hostinger API key not configured");
		}

		const catalogItems = await fetchHostingerCatalog(apiKey);
		return catalogItems.filter((item) => item.name.startsWith("KVM"));
	}),

	servers: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			return [];
		}
		return await fetchHostingerServers(apiKey);
	}),

	dataCenters: protectedProcedure.query(async () => {
		const apiKey = process.env.HOSTINGER_API_KEY;
		if (!apiKey) {
			throw new Error("Hostinger API key not configured");
		}
		return await fetchHostingerDataCenters(apiKey);
	}),
});
