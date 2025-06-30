import {
	apiCreateMount,
	apiFindOneMount,
	apiRemoveMount,
	apiUpdateMount,
	mounts,
} from "@/server/db/schema";
import {
	createMount,
	deleteMount,
	findMountById,
	updateMount,
} from "@dokploy/server";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@dokploy/server/db";

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
			return await db.query.mounts.findMany({
				where: and(
					eq(mounts.applicationId, input.applicationId),
					eq(mounts.type, "volume"),
				),
			});
		}),
});
