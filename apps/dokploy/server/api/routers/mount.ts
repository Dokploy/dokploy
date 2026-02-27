import {
	checkServiceAccess,
	createMount,
	deleteMount,
	findApplicationById,
	findComposeById,
	findMariadbById,
	findMongoById,
	findMountById,
	findMountOrganizationId,
	findMountsByApplicationId,
	findMySqlById,
	findPostgresById,
	findRedisById,
	getServiceContainer,
	updateMount,
} from "@dokploy/server";
import type { ServiceType } from "@dokploy/server/db/schema/mount";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	apiCreateMount,
	apiFindMountByApplicationId,
	apiFindOneMount,
	apiRemoveMount,
	apiUpdateMount,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";

async function getServiceOrganizationId(
	serviceId: string,
	serviceType: ServiceType,
): Promise<string | null> {
	switch (serviceType) {
		case "application": {
			const app = await findApplicationById(serviceId);
			return app?.environment?.project?.organizationId ?? null;
		}
		case "postgres": {
			const postgres = await findPostgresById(serviceId);
			return postgres?.environment?.project?.organizationId ?? null;
		}
		case "mariadb": {
			const mariadb = await findMariadbById(serviceId);
			return mariadb?.environment?.project?.organizationId ?? null;
		}
		case "mongo": {
			const mongo = await findMongoById(serviceId);
			return mongo?.environment?.project?.organizationId ?? null;
		}
		case "mysql": {
			const mysql = await findMySqlById(serviceId);
			return mysql?.environment?.project?.organizationId ?? null;
		}
		case "redis": {
			const redis = await findRedisById(serviceId);
			return redis?.environment?.project?.organizationId ?? null;
		}
		case "compose": {
			const compose = await findComposeById(serviceId);
			return compose?.environment?.project?.organizationId ?? null;
		}
		default:
			return null;
	}
}

export const mountRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMount)
		.mutation(async ({ input }) => {
			await createMount(input);
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
			return await deleteMount(input.mountId);
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
	listByServiceId: protectedProcedure
		.input(apiFindMountByApplicationId)
		.query(async ({ input, ctx }) => {
			console.log("input", input);
			if (ctx.user.role === "member") {
				await checkServiceAccess(
					ctx.user.id,
					input.serviceId,
					ctx.session.activeOrganizationId,
					"access",
				);
			}
			const organizationId = await getServiceOrganizationId(
				input.serviceId,
				input.serviceType,
			);
			if (
				organizationId === null ||
				organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message:
						"You are not authorized to access this service or it does not exist",
				});
			}
			return await findMountsByApplicationId(
				input.serviceId,
				input.serviceType,
			);
		}),
});
