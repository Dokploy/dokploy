import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import {
	apiCreateTag,
	apiFindOneTag,
	apiRemoveTag,
	apiUpdateTag,
	projects,
	projectTags,
	tags,
} from "@/server/db/schema";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const tagRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateTag)
		.mutation(async ({ input, ctx }) => {
			try {
				const newTag = await db
					.insert(tags)
					.values({
						name: input.name,
						color: input.color,
						organizationId: ctx.session.activeOrganizationId,
					})
					.returning();

				return newTag[0];
			} catch (error) {
				if (
					error instanceof Error &&
					error.message.includes("unique_org_tag_name")
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A tag with this name already exists in your organization",
					});
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error creating tag: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	all: protectedProcedure.query(async ({ ctx }) => {
		try {
			const organizationTags = await db.query.tags.findMany({
				where: eq(tags.organizationId, ctx.session.activeOrganizationId),
				orderBy: (tags, { asc }) => [asc(tags.name)],
			});

			return organizationTags;
		} catch (error) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Error fetching tags: ${error instanceof Error ? error.message : error}`,
				cause: error,
			});
		}
	}),

	one: protectedProcedure.input(apiFindOneTag).query(async ({ input, ctx }) => {
		try {
			const tag = await db.query.tags.findFirst({
				where: and(
					eq(tags.tagId, input.tagId),
					eq(tags.organizationId, ctx.session.activeOrganizationId),
				),
			});

			if (!tag) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Tag not found",
				});
			}

			return tag;
		} catch (error) {
			if (error instanceof TRPCError) {
				throw error;
			}
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: `Error fetching tag: ${error instanceof Error ? error.message : error}`,
				cause: error,
			});
		}
	}),

	update: protectedProcedure
		.input(apiUpdateTag)
		.mutation(async ({ input, ctx }) => {
			try {
				// First verify the tag belongs to the user's organization
				const existingTag = await db.query.tags.findFirst({
					where: and(
						eq(tags.tagId, input.tagId),
						eq(tags.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!existingTag) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Tag not found or you don't have permission to update it",
					});
				}

				const updatedTag = await db
					.update(tags)
					.set({
						...(input.name !== undefined && { name: input.name }),
						...(input.color !== undefined && { color: input.color }),
					})
					.where(eq(tags.tagId, input.tagId))
					.returning();

				return updatedTag[0];
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				if (
					error instanceof Error &&
					error.message.includes("unique_org_tag_name")
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "A tag with this name already exists in your organization",
					});
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error updating tag: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	remove: protectedProcedure
		.input(apiRemoveTag)
		.mutation(async ({ input, ctx }) => {
			try {
				// First verify the tag belongs to the user's organization
				const existingTag = await db.query.tags.findFirst({
					where: and(
						eq(tags.tagId, input.tagId),
						eq(tags.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!existingTag) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Tag not found or you don't have permission to delete it",
					});
				}

				// Delete the tag - cascade delete will handle projectTags associations
				await db.delete(tags).where(eq(tags.tagId, input.tagId));

				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error deleting tag: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	assignToProject: protectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1),
				tagId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				// Verify the project belongs to the user's organization
				const project = await db.query.projects.findFirst({
					where: and(
						eq(projects.projectId, input.projectId),
						eq(projects.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message:
							"Project not found or you don't have permission to modify it",
					});
				}

				// Verify the tag belongs to the user's organization
				const tag = await db.query.tags.findFirst({
					where: and(
						eq(tags.tagId, input.tagId),
						eq(tags.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!tag) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Tag not found or you don't have permission to use it",
					});
				}

				// Insert the project-tag association
				const newAssociation = await db
					.insert(projectTags)
					.values({
						projectId: input.projectId,
						tagId: input.tagId,
					})
					.returning();

				return newAssociation[0];
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				if (
					error instanceof Error &&
					error.message.includes("unique_project_tag")
				) {
					throw new TRPCError({
						code: "CONFLICT",
						message: "This tag is already assigned to this project",
					});
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error assigning tag to project: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	removeFromProject: protectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1),
				tagId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				// Verify the project belongs to the user's organization
				const project = await db.query.projects.findFirst({
					where: and(
						eq(projects.projectId, input.projectId),
						eq(projects.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message:
							"Project not found or you don't have permission to modify it",
					});
				}

				// Verify the tag belongs to the user's organization
				const tag = await db.query.tags.findFirst({
					where: and(
						eq(tags.tagId, input.tagId),
						eq(tags.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!tag) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "Tag not found or you don't have permission to use it",
					});
				}

				// Delete the project-tag association
				await db
					.delete(projectTags)
					.where(
						and(
							eq(projectTags.projectId, input.projectId),
							eq(projectTags.tagId, input.tagId),
						),
					);

				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error removing tag from project: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),

	bulkAssign: protectedProcedure
		.input(
			z.object({
				projectId: z.string().min(1),
				tagIds: z.array(z.string().min(1)),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				// Verify the project belongs to the user's organization
				const project = await db.query.projects.findFirst({
					where: and(
						eq(projects.projectId, input.projectId),
						eq(projects.organizationId, ctx.session.activeOrganizationId),
					),
				});

				if (!project) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message:
							"Project not found or you don't have permission to modify it",
					});
				}

				// Verify all tags belong to the user's organization
				if (input.tagIds.length > 0) {
					const tagCount = await db.query.tags.findMany({
						where: and(
							eq(tags.organizationId, ctx.session.activeOrganizationId),
						),
					});

					const validTagIds = tagCount.map((tag) => tag.tagId);
					const invalidTags = input.tagIds.filter(
						(id) => !validTagIds.includes(id),
					);

					if (invalidTags.length > 0) {
						throw new TRPCError({
							code: "NOT_FOUND",
							message: "One or more tags not found in your organization",
						});
					}
				}

				// Delete all existing tag associations for this project
				await db
					.delete(projectTags)
					.where(eq(projectTags.projectId, input.projectId));

				// Insert new tag associations
				if (input.tagIds.length > 0) {
					await db.insert(projectTags).values(
						input.tagIds.map((tagId) => ({
							projectId: input.projectId,
							tagId,
						})),
					);
				}

				return { success: true };
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Error bulk assigning tags to project: ${error instanceof Error ? error.message : error}`,
					cause: error,
				});
			}
		}),
});
