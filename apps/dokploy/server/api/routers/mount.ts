import {
	createMount,
	deleteMount,
	findApplicationById,
	findMountById,
	findMountOrganizationId,
	getServiceContainer,
	updateMount,
	getSwarmNodes,
	findServerById,
	distributeCredentialsToNodes,
	syncMountToAllNodes,
	verifyMountsOnNodes,
	cleanupMountFromNodes,
	testNodeConnectivity,
	getSwarmNodesForMount,
	getServerId,
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
import { db } from "@/server/db";
import { mountNodeStatus } from "@dokploy/server/db/schema/mount-node-status";
import { eq, and } from "drizzle-orm";

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
	getAvailableNodes: protectedProcedure
		.input(
			z.object({
				serverId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			const nodes = await getSwarmNodes(input.serverId || undefined);
			return (
				nodes?.map((node) => ({
					nodeId: node.ID,
					hostname: node.Description?.Hostname || node.ID,
					ip: node.Status?.Addr || "",
					role: node.Spec.Role,
					status: node.Status?.State || "unknown",
					availability: node.Spec.Availability,
					labels: node.Spec.Labels || {},
				})) || []
			);
		}),
	testNodeConnectivity: protectedProcedure
		.input(
			z.object({
				nodeId: z.string().min(1),
				serverId: z.string().optional(),
				nfsServer: z.string().optional(),
				smbServer: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
			}
			return await testNodeConnectivity(
				input.nodeId,
				input.nfsServer,
				input.smbServer,
				input.serverId || undefined,
			);
		}),
	syncMountToSwarm: protectedProcedure
		.input(
			z.object({
				mountId: z.string().min(1),
				nodeIds: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to sync this mount",
				});
			}

			const mount = await findMountById(input.mountId);
			const serverId = await getServerId(mount);

			// Distribute credentials if needed
			if (mount.credentialsId) {
				await distributeCredentialsToNodes(
					mount,
					input.nodeIds,
					serverId,
				);
			}

			// Sync mounts to nodes
			const results = await syncMountToAllNodes(
				mount,
				input.nodeIds,
				serverId,
			);

			return Array.from(results.entries()).map(([nodeId, result]) => ({
				nodeId,
				...result,
			}));
		}),
	getMountNodeStatus: protectedProcedure
		.input(apiFindOneMount)
		.query(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this mount",
				});
			}

			const statuses = await db.query.mountNodeStatus.findMany({
				where: eq(mountNodeStatus.mountId, input.mountId),
			});

			return statuses;
		}),
	verifyMountsOnNodes: protectedProcedure
		.input(
			z.object({
				mountId: z.string().min(1),
				nodeIds: z.array(z.string()).min(1).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to verify this mount",
				});
			}

			const mount = await findMountById(input.mountId);
			const serverId = await getServerId(mount);

			const nodeIds =
				input.nodeIds || mount.targetNodes || [];

			if (nodeIds.length === 0) {
				return [];
			}

			const results = await verifyMountsOnNodes(
				input.mountId,
				nodeIds,
				serverId,
			);

			return Array.from(results.entries()).map(([nodeId, result]) => ({
				nodeId,
				...result,
			}));
		}),
	updateMountNodes: protectedProcedure
		.input(
			z.object({
				mountId: z.string().min(1),
				nodeIds: z.array(z.string()).min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const organizationId = await findMountOrganizationId(input.mountId);
			if (organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to update this mount",
				});
			}

			const mount = await findMountById(input.mountId);
			const serverId = await getServerId(mount);

			// Get current target nodes
			const currentNodes = mount.targetNodes || [];
			const newNodes = input.nodeIds;

			// Find nodes to add and remove
			const nodesToAdd = newNodes.filter((n) => !currentNodes.includes(n));
			const nodesToRemove = currentNodes.filter((n) => !newNodes.includes(n));

			// Remove mounts from nodes that are no longer targeted
			if (nodesToRemove.length > 0) {
				await cleanupMountFromNodes(mount, nodesToRemove, serverId);
			}

			// Add mounts to new nodes
			if (nodesToAdd.length > 0) {
				if (mount.credentialsId) {
					await distributeCredentialsToNodes(
						mount,
						nodesToAdd,
						serverId,
					);
				}
				await syncMountToAllNodes(mount, nodesToAdd, serverId);
			}

			// Update mount with new target nodes
			await updateMount(input.mountId, {
				targetNodes: newNodes,
			});

			return true;
		}),
});
