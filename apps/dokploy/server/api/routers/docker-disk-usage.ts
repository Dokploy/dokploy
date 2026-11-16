import {
	assertServerAccess,
	cleanupBuilders,
	getBuildCache,
	getDockerDiskUsage,
} from "@dokploy/server";
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
			await assertServerAccess(ctx.session, input.serverId);
			return await getDockerDiskUsage(input.serverId);
		}),

	getBuildCache: withPermission("docker", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(ctx.session, input.serverId);
			return await getBuildCache(input.serverId);
		}),

	pruneBuildCache: withPermission("docker", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			await assertServerAccess(ctx.session, input.serverId);
			await cleanupBuilders(input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: "build-cache",
				resourceName: "Docker build cache",
			});
		}),
});
