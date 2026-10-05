import { listContainerDirectory, readContainerFile } from "@dokploy/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import {
	FILESYSTEM_SERVICE_TYPES,
	getAuthorizedServiceFilesystemContainer,
	listServiceFilesystemContainers,
	toFilesystemTRPCError,
} from "@/server/api/utils/service-filesystem";

const apiFindOneServiceFilesystem = z.object({
	serviceType: z.enum(FILESYSTEM_SERVICE_TYPES),
	serviceId: z.string().min(1),
});

export const filesystemRouter = createTRPCRouter({
	containers: protectedProcedure
		.input(apiFindOneServiceFilesystem)
		.query(async ({ input, ctx }) => {
			try {
				return await listServiceFilesystemContainers(
					ctx,
					input.serviceType,
					input.serviceId,
				);
			} catch (error) {
				return toFilesystemTRPCError(error);
			}
		}),

	list: protectedProcedure
		.input(
			apiFindOneServiceFilesystem.extend({
				containerId: z
					.string()
					.regex(/^[a-f0-9]{64}$/i, "Invalid container id."),
				path: z.string().min(1).max(4096),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				const { container } = await getAuthorizedServiceFilesystemContainer(
					ctx,
					input.serviceType,
					input.serviceId,
					input.containerId,
				);
				return await listContainerDirectory(container, input.path);
			} catch (error) {
				return toFilesystemTRPCError(error);
			}
		}),

	readFile: protectedProcedure
		.input(
			apiFindOneServiceFilesystem.extend({
				containerId: z
					.string()
					.regex(/^[a-f0-9]{64}$/i, "Invalid container id."),
				path: z.string().min(1).max(4096),
			}),
		)
		.query(async ({ input, ctx }) => {
			try {
				const { container } = await getAuthorizedServiceFilesystemContainer(
					ctx,
					input.serviceType,
					input.serviceId,
					input.containerId,
				);
				return await readContainerFile(container, input.path);
			} catch (error) {
				return toFilesystemTRPCError(error);
			}
		}),
});
