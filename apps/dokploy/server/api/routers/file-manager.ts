import {
	checkServiceAccess,
	copyFileManagerEntry,
	createFileManagerDirectory,
	deleteFileManagerEntry,
	listFileManagerEntries,
	readFileManagerFile,
	resolveFileManagerContext,
	searchFileManagerEntries,
	statFileManagerEntry,
	type FileManagerServiceType,
	writeFileManagerFile,
	moveFileManagerEntry,
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

	const context = await resolveFileManagerContext(
		input.serviceType as FileManagerServiceType,
		input.serviceId,
	);
	if (context.organizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this file manager",
		});
	}
	return context;
};

export const fileManagerRouter = createTRPCRouter({
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
			return listFileManagerEntries({
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
			return statFileManagerEntry({
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
			return readFileManagerFile({
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
			return writeFileManagerFile({
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
			return createFileManagerDirectory({
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
			return deleteFileManagerEntry({
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
			return moveFileManagerEntry({
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
			return copyFileManagerEntry({
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
			return searchFileManagerEntries({
				context,
				query: input.query,
				path: input.path,
				includeHidden: input.includeHidden,
				limit: input.limit,
				maxDepth: input.maxDepth,
			});
		}),
});
