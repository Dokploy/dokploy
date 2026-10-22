import {
	deleteVolumeFile,
	findServerById,
	getVolumeConfig,
	getVolumes,
	getVolumesSize,
	listVolumeFiles,
	readVolumeFile,
	removeVolume,
	writeVolumeFile,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, withPermission } from "../trpc";

export const volumeNameRegex = /^[a-zA-Z0-9.\-_]+$/;

const volumePathSchema = z
	.string()
	.min(1)
	.max(4096)
	.refine(
		(path) => path.startsWith("/") && !path.includes("\0"),
		"Path must be absolute.",
	);

export const dockerVolumeRouter = createTRPCRouter({
	getVolumes: withPermission("docker", "read")
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
			return await getVolumes(input.serverId);
		}),

	getVolumesSize: withPermission("docker", "read")
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
			return await getVolumesSize(input.serverId);
		}),

	listVolumeFiles: withPermission("docker", "read")
		.input(
			z.object({
				volumeName: z
					.string()
					.min(1)
					.regex(volumeNameRegex, "Invalid volume name."),
				path: volumePathSchema,
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
			return await listVolumeFiles(
				input.volumeName,
				input.path,
				input.serverId,
			);
		}),

	readVolumeFile: withPermission("docker", "read")
		.input(
			z.object({
				volumeName: z
					.string()
					.min(1)
					.regex(volumeNameRegex, "Invalid volume name."),
				path: volumePathSchema,
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
			return await readVolumeFile(input.volumeName, input.path, input.serverId);
		}),

	writeVolumeFile: withPermission("docker", "read")
		.input(
			z.object({
				volumeName: z
					.string()
					.min(1)
					.regex(volumeNameRegex, "Invalid volume name."),
				path: volumePathSchema,
				content: z.string(),
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
			await writeVolumeFile(
				input.volumeName,
				input.path,
				input.content,
				input.serverId,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "docker",
				resourceId: input.volumeName,
				resourceName: `${input.volumeName}:${input.path}`,
			});
		}),

	deleteVolumeFile: withPermission("docker", "read")
		.input(
			z.object({
				volumeName: z
					.string()
					.min(1)
					.regex(volumeNameRegex, "Invalid volume name."),
				path: volumePathSchema.refine(
					(path) => path !== "/",
					"Cannot delete the volume root.",
				),
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
			await deleteVolumeFile(input.volumeName, input.path, input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: input.volumeName,
				resourceName: `${input.volumeName}:${input.path}`,
			});
		}),

	getVolumeConfig: withPermission("docker", "read")
		.input(
			z.object({
				volumeName: z
					.string()
					.min(1)
					.regex(volumeNameRegex, "Invalid volume name."),
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
			return await getVolumeConfig(input.volumeName, input.serverId);
		}),

	removeVolume: withPermission("docker", "read")
		.input(
			z.object({
				volumeName: z
					.string()
					.min(1)
					.regex(volumeNameRegex, "Invalid volume name."),
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
			await removeVolume(input.volumeName, input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: input.volumeName,
				resourceName: input.volumeName,
			});
		}),
});
