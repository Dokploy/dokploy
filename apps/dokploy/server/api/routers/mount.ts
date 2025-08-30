import {
	createMount,
	deleteMount,
	findApplicationById,
	findMountById,
	getServiceContainer,
	updateMount,
} from "@dokploy/server";
import { z } from "zod";
import {
	apiCreateMount,
	apiFindOneMount,
	apiRemoveMount,
	apiUpdateMount,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const mountRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMount)
		.mutation(async ({ input }) => {
			await createMount(input);
			return true;
		}),
	remove: protectedProcedure
		.input(apiRemoveMount)
		.mutation(async ({ input }) => {
			return await deleteMount(input.mountId);
		}),

	one: protectedProcedure.input(apiFindOneMount).query(async ({ input }) => {
		return await findMountById(input.mountId);
	}),
	update: protectedProcedure
		.input(apiUpdateMount)
		.mutation(async ({ input }) => {
			return await updateMount(input.mountId, input);
		}),
	allNamedByApplicationId: protectedProcedure
		.input(z.object({ applicationId: z.string().min(1) }))
		.query(async ({ input }) => {
			const app = await findApplicationById(input.applicationId);
			const container = await getServiceContainer(app.appName, app.serverId);
			const mounts = container?.Mounts.filter(
				(mount) => mount.Type === "volume" && mount.Source !== "",
			);
			return mounts;
		}),
});
