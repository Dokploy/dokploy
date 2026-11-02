import {
	cleanupBuilders,
	findServerById,
	getBuildCache,
	getDockerDiskUsage,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, withPermission } from "../trpc";

export const dockerDiskUsageRouter = createTRPCRouter({
	getDiskUsage: withPermission("docker", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return await getDockerDiskUsage(input.serverId);
		}),

	getBuildCache: withPermission("docker", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return await getBuildCache(input.serverId);
		}),

	pruneBuildCache: withPermission("docker", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			await cleanupBuilders(input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: "build-cache",
				resourceName: "Docker build cache",
			});
		}),
});
