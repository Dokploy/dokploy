import {
	fetchHostingerCatalog,
	fetchHostingerDataCenters,
} from "@dokploy/server/index";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const hostingerRouter = createTRPCRouter({
	vpsPlans: protectedProcedure.query(async () => {
		const catalogItems = await fetchHostingerCatalog();
		return catalogItems.filter((item) => item?.name?.startsWith("KVM"));
	}),

	dataCenters: protectedProcedure.query(async () => {
		return await fetchHostingerDataCenters();
	}),
});
