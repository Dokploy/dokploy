import {
	findServerById,
	getImageConfig,
	getImages,
	getImagesOutdatedStatus,
	invalidateRemoteDigestCache,
	pullImage as pullDockerImage,
	pullRemoteImage,
	removeImage,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, withPermission } from "../trpc";

export const dockerImageRouter = createTRPCRouter({
	getImages: withPermission("docker", "read")
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
			return await getImages(input.serverId);
		}),

	getImagesOutdatedStatus: withPermission("docker", "read")
		.input(
			z.object({
				references: z.array(z.string().min(1)).max(5000),
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

			const chunkSize = 250;
			const statuses = [];
			for (let i = 0; i < input.references.length; i += chunkSize) {
				const chunk = input.references.slice(i, i + chunkSize);
				const chunkStatuses = await getImagesOutdatedStatus(
					chunk,
					input.serverId,
				);
				statuses.push(...chunkStatuses);
			}

			return statuses;
		}),

	getImageConfig: withPermission("docker", "read")
		.input(
			z.object({
				imageRef: z.string().min(1),
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
			return await getImageConfig(input.imageRef, input.serverId);
		}),

	pullImage: withPermission("docker", "read")
		.input(
			z.object({
				imageRef: z.string().min(1),
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

			if (input.serverId) {
				await pullRemoteImage(input.imageRef, input.serverId);
			} else {
				await pullDockerImage(input.imageRef);
			}
			invalidateRemoteDigestCache(input.imageRef, input.serverId);

			await audit(ctx, {
				action: "update",
				resourceType: "docker",
				resourceId: input.imageRef,
				resourceName: input.imageRef,
			});
		}),

	removeImage: withPermission("docker", "read")
		.input(
			z.object({
				repository: z.string(),
				tag: z.string(),
				id: z.string().min(1),
				force: z.boolean().optional(),
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
			await removeImage(
				{
					repository: input.repository,
					tag: input.tag,
					id: input.id,
					force: input.force,
				},
				input.serverId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: input.id,
				resourceName:
					input.repository !== "<none>" && input.tag !== "<none>"
						? `${input.repository}:${input.tag}`
						: input.id,
			});
		}),
});
