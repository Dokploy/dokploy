import { findMemberByUserId } from "@dokploy/server/services/permission";
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
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

export const tagRouter = createTRPCRouter({
	create: withPermission("tag", "create")
		.meta({
			openapi: {
				summary: "Create tag",
				description: "Creates a new tag with a name and color for the current organization. Tag names must be unique within the organization.",
			},
		})
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

	all: protectedProcedure
		.meta({
			openapi: {
				summary: "List all tags",
				description: "Returns all tags for the current organization, ordered alphabetically by name.",
			},
		})
		.query(async ({ ctx }) => {
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

	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get tag",
				description: "Returns a single tag by ID. Only returns tags belonging to the caller's organization.",
			},
		})
		.input(apiFindOneTag)
		.query(async ({ input, ctx }) => {
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

	update: withPermission("tag", "update")
		.meta({
			openapi: {
				summary: "Update tag",
				description: "Updates an existing tag's name and/or color. Verifies the tag belongs to the caller's organization. Tag names must remain unique.",
			},
		})
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

	remove: withPermission("tag", "delete")
		.meta({
			openapi: {
				summary: "Delete tag",
				description: "Deletes a tag by ID. Cascade-deletes all project-tag associations. Verifies the tag belongs to the caller's organization.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Assign tag to project",
				description: "Associates a tag with a project. Verifies that both the tag and project belong to the caller's organization and that the caller has project access.",
			},
		})
		.input(
			z.object({
				projectId: z.string().min(1),
				tagId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const memberRecord = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

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

				// Verify the member has access to the project
				if (
					memberRecord.role !== "owner" &&
					memberRecord.role !== "admin" &&
					!memberRecord.accessedProjects.includes(input.projectId)
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this project",
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
		.meta({
			openapi: {
				summary: "Remove tag from project",
				description: "Removes a tag-project association. Verifies that both the tag and project belong to the caller's organization and that the caller has project access.",
			},
		})
		.input(
			z.object({
				projectId: z.string().min(1),
				tagId: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const memberRecord = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

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

				// Verify the member has access to the project
				if (
					memberRecord.role !== "owner" &&
					memberRecord.role !== "admin" &&
					!memberRecord.accessedProjects.includes(input.projectId)
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this project",
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
		.meta({
			openapi: {
				summary: "Bulk assign tags to project",
				description: "Replaces all tag associations for a project with the provided list of tag IDs. Removes existing associations first, then inserts the new set.",
			},
		})
		.input(
			z.object({
				projectId: z.string().min(1),
				tagIds: z.array(z.string().min(1)),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			try {
				const memberRecord = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);

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

				// Verify the member has access to the project
				if (
					memberRecord.role !== "owner" &&
					memberRecord.role !== "admin" &&
					!memberRecord.accessedProjects.includes(input.projectId)
				) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to this project",
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
