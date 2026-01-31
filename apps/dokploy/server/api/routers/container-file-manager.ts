import {
	checkServiceAccess,
	copyContainerFileManagerEntry,
	createContainerFileManagerDirectory,
	deleteContainerFileManagerEntry,
	listContainerFileManagerEntries,
	moveContainerFileManagerEntry,
	readContainerFileManagerFile,
	resolveContainerFileManagerContext,
	snapshotContainerFileManager,
	searchContainerFileManagerEntries,
	statContainerFileManagerEntry,
	type FileManagerServiceType,
	writeContainerFileManagerFile,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";

const serviceTypeSchema = z.enum([
	"application",
	"postgres",
	"mysql",
	"mariadb",
	"mongo",
	"redis",
	"compose",
]);

const serviceTargetSchema = z.object({
	serviceId: z.string().min(1),
	serviceType: serviceTypeSchema,
	serviceName: z.string().min(1).optional(),
});

const getContext = async (
	input: z.infer<typeof serviceTargetSchema>,
	ctx: {
		session: { activeOrganizationId: string };
		user: { id: string; role: "member" | "admin" | "owner" };
	},
) => {
	if (ctx.user.role === "member") {
		await checkServiceAccess(
			ctx.user.id,
			input.serviceId,
			ctx.session.activeOrganizationId,
			"access",
		);
	}

	if (input.serviceType === "compose" && !input.serviceName) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Compose service name is required for container access.",
		});
	}

	const context = await resolveContainerFileManagerContext(
		input.serviceType as FileManagerServiceType,
		input.serviceId,
		{
			serviceName: input.serviceName ?? null,
		},
	);
	if (context.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this container filesystem",
		});
	}
	return context;
};

export const containerFileManagerRouter = createTRPCRouter({
	status: protectedProcedure
		.input(serviceTargetSchema)
		.query(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return {
				containerId: context.containerId,
				containerName: context.containerName,
				containerImage: context.containerImage,
				containerState: context.containerState,
				containerStatus: context.containerStatus,
				containerCreatedAt: context.containerCreatedAt,
			};
		}),
	snapshot: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().optional(),
				maxBytes: z.number().int().min(1).max(50 * 1024 * 1024).optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return snapshotContainerFileManager({
				context,
				path: input.path,
				maxBytes: input.maxBytes,
			});
		}),
	list: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().optional(),
				includeHidden: z.boolean().optional(),
				limit: z.number().int().min(1).max(5000).optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return listContainerFileManagerEntries({
				context,
				path: input.path,
				includeHidden: input.includeHidden,
				limit: input.limit,
			});
		}),
	stat: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().min(1),
			}),
		)
		.query(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return statContainerFileManagerEntry({
				context,
				path: input.path,
			});
		}),
	read: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().min(1),
				encoding: z.enum(["utf8", "base64"]).optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return readContainerFileManagerFile({
				context,
				path: input.path,
				encoding: input.encoding ?? "utf8",
			});
		}),
	write: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().min(1),
				content: z.string(),
				encoding: z.enum(["utf8", "base64"]).optional(),
				overwrite: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return writeContainerFileManagerFile({
				context,
				path: input.path,
				content: input.content,
				encoding: input.encoding ?? "utf8",
				overwrite: input.overwrite ?? false,
			});
		}),
	mkdir: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return createContainerFileManagerDirectory({
				context,
				path: input.path,
			});
		}),
	delete: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				path: z.string().min(1),
				recursive: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return deleteContainerFileManagerEntry({
				context,
				path: input.path,
				recursive: input.recursive ?? false,
			});
		}),
	move: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				from: z.string().min(1),
				to: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return moveContainerFileManagerEntry({
				context,
				from: input.from,
				to: input.to,
			});
		}),
	copy: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				from: z.string().min(1),
				to: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return copyContainerFileManagerEntry({
				context,
				from: input.from,
				to: input.to,
			});
		}),
	search: protectedProcedure
		.input(
			serviceTargetSchema.extend({
				query: z.string().min(1),
				path: z.string().optional(),
				includeHidden: z.boolean().optional(),
				limit: z.number().int().min(1).max(2000).optional(),
				maxDepth: z.number().int().min(1).max(12).optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const context = await getContext(input, ctx);
			return searchContainerFileManagerEntries({
				context,
				query: input.query,
				path: input.path,
				includeHidden: input.includeHidden,
				limit: input.limit,
				maxDepth: input.maxDepth,
			});
		}),
});
