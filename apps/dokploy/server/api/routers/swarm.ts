import {
	getAccessibleServerIds,
	getAllContainerStats,
	getApplicationInfo,
	getNodeApplications,
	getNodeInfo,
	getSwarmNodes,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { assertLocalHostAccess } from "@/server/api/utils/local-host-access";
import { createTRPCRouter, withPermission } from "../trpc";
import { containerIdRegex } from "./docker";

const assertSwarmServerAccess = async (
	ctx: {
		user: {
			id: string;
		};
		session: {
			userId: string;
			activeOrganizationId: string;
		};
	},
	serverId?: string,
) => {
	if (!serverId) {
		await assertLocalHostAccess(ctx);
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

export const swarmRouter = createTRPCRouter({
	getNodes: withPermission("server", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertSwarmServerAccess(ctx, input.serverId);

			return await getSwarmNodes(input.serverId);
		}),
	getNodeInfo: withPermission("server", "read")
		.input(z.object({ nodeId: z.string(), serverId: z.string().optional() }))
		.query(async ({ input, ctx }) => {
			await assertSwarmServerAccess(ctx, input.serverId);

			return await getNodeInfo(input.nodeId, input.serverId);
		}),
	getNodeApps: withPermission("server", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertSwarmServerAccess(ctx, input.serverId);

			return getNodeApplications(input.serverId);
		}),
	getAppInfos: withPermission("server", "read")
		.meta({
			openapi: {
				path: "/drop-deployment",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(
			z.object({
				appName: z
					.string()
					.min(1)
					.regex(containerIdRegex, "Invalid app name.")
					.array(),
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertSwarmServerAccess(ctx, input.serverId);

			return await getApplicationInfo(input.appName, input.serverId);
		}),
	getContainerStats: withPermission("server", "read")
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			await assertSwarmServerAccess(ctx, input.serverId);

			return await getAllContainerStats(input.serverId);
		}),
});
