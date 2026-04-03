import {
	createMount,
	deleteMount,
	findApplicationById,
	findComposeById,
	findLibsqlById,
	findMariadbById,
	findMongoById,
	findMountById,
	findMountsByApplicationId,
	findMySqlById,
	findPostgresById,
	findRedisById,
	getServiceContainer,
	updateMount,
} from "@dokploy/server";
import type { ServiceType } from "@dokploy/server/db/schema/mount";
import {
	checkServiceAccess,
	checkServicePermissionAndAccess,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
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
		case "libsql": {
			const libsql = await findLibsqlById(serviceId);
			return libsql?.environment?.project?.organizationId ?? null;
		}
		default:
			return null;
	}
}

export const mountRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateMount)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				volume: ["create"],
			});
			const mount = await createMount(input);
			await audit(ctx, {
				action: "create",
				resourceType: "mount",
				resourceId: mount.mountId,
				resourceName: input.mountPath,
			});
			return mount;
		}),
	remove: protectedProcedure
		.input(apiRemoveMount)
		.mutation(async ({ input, ctx }) => {
			const mount = await findMountById(input.mountId);
			const serviceId =
				mount.applicationId ||
				mount.postgresId ||
				mount.mariadbId ||
				mount.mongoId ||
				mount.mysqlId ||
				mount.redisId ||
				mount.libsqlId ||
				mount.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volume: ["delete"],
				});
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "mount",
				resourceId: input.mountId,
			});
			return await deleteMount(input.mountId);
		}),

	one: protectedProcedure
		.input(apiFindOneMount)
		.query(async ({ input, ctx }) => {
			const mount = await findMountById(input.mountId);
			const serviceId =
				mount.applicationId ||
				mount.postgresId ||
				mount.mariadbId ||
				mount.mongoId ||
				mount.mysqlId ||
				mount.redisId ||
				mount.libsqlId ||
				mount.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volume: ["read"],
				});
			}
			return mount;
		}),
	update: protectedProcedure
		.input(apiUpdateMount)
		.mutation(async ({ input, ctx }) => {
			const mount = await findMountById(input.mountId);
			const serviceId =
				mount.applicationId ||
				mount.postgresId ||
				mount.mariadbId ||
				mount.mongoId ||
				mount.mysqlId ||
				mount.redisId ||
				mount.libsqlId ||
				mount.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					volume: ["create"],
				});
			}
			await audit(ctx, {
				action: "update",
				resourceType: "mount",
				resourceId: input.mountId,
				resourceName: input.mountPath,
			});
			return await updateMount(input.mountId, input);
		}),
	allNamedByApplicationId: protectedProcedure
		.input(z.object({ applicationId: z.string().min(1) }))
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				volume: ["read"],
			});
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
			await checkServiceAccess(ctx, input.serviceId, "read");
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
