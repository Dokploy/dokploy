import {
	createMount,
	deleteMount,
	findApplicationById,
	findMountById,
	findMountOrganizationId,
	getServiceContainer,
	updateMount,
	recordActivity,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
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
		.mutation(async ({ input, ctx }) => {
			const mount = await createMount(input);
			await recordActivity({
				userId: ctx.user.id,
				organizationId: ctx.session.activeOrganizationId,
				action: "mount.create",
				resourceType: "mount",
				resourceId: mount.mountId,
				metadata: { mountPath: mount.mountPath, type: mount.type },
			});
			return true;
		}),
	remove: protectedProcedure
		.input(apiRemoveMount)
		.mutation(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this mount",
				});
			}
			const mount = await findMountById(input.mountId);
			const result = await deleteMount(input.mountId);
			await recordActivity({
				userId: ctx.user.id,
				organizationId: ctx.session.activeOrganizationId,
				action: "mount.delete",
				resourceType: "mount",
				resourceId: mount.mountId,
				metadata: { mountPath: mount.mountPath, type: mount.type },
			});
			return result;
		}),

	one: protectedProcedure
		.input(apiFindOneMount)
		.query(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this mount",
				});
			}
			return await findMountById(input.mountId);
		}),
	update: protectedProcedure
		.input(apiUpdateMount)
		.mutation(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this mount",
				});
			}
			const result = await updateMount(input.mountId, input);
			const mount = await findMountById(input.mountId);
			await recordActivity({
				userId: ctx.user.id,
				organizationId: ctx.session.activeOrganizationId,
				action: "mount.update",
				resourceType: "mount",
				resourceId: mount.mountId,
				metadata: { mountPath: mount.mountPath, type: mount.type },
			});
			return result;
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
