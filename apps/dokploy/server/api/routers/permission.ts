import { createTRPCRouter, protectedProcedure } from "../trpc";
import { permissionService } from "@dokploy/server/services/permission";
import { z } from "zod";

export const permissionRouter = createTRPCRouter({
	// Get user permissions
	getUserPermissions: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
				organizationId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Check if user has permission to view other user's permissions
			if (
				ctx.user.role !== "owner" &&
				ctx.user.role !== "admin" &&
				ctx.user.id !== input.userId
			) {
				throw new Error(
					"You don't have permission to view this user's permissions",
				);
			}

			const permissions = await permissionService.getUserPermissions(
				input.userId,
				input.organizationId,
			);

			return {
				permissions,
				userId: input.userId,
				organizationId: input.organizationId,
			};
		}),

	// Check specific permission
	checkPermission: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
				organizationId: z.string(),
				resource: z.string(),
				action: z.string(),
				resourceId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Check if user has permission to check other user's permissions
			if (
				ctx.user.role !== "owner" &&
				ctx.user.role !== "admin" &&
				ctx.user.id !== input.userId
			) {
				throw new Error(
					"You don't have permission to check this user's permissions",
				);
			}

			const result = await permissionService.checkPermission(
				{
					userId: input.userId,
					organizationId: input.organizationId,
					resourceId: input.resourceId,
					resourceType: input.resource as any,
				},
				input.action as any,
				input.resource as any,
			);

			return result;
		}),

	// Validate permission assignment
	validatePermissionAssignment: protectedProcedure
		.input(
			z.object({
				userId: z.string(),
				organizationId: z.string(),
				permissions: z.record(z.any()),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			// Only owners and admins can validate permission assignments
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				throw new Error(
					"You don't have permission to validate permission assignments",
				);
			}

			const result = await permissionService.validatePermissionAssignment(
				input.userId,
				input.organizationId,
				input.permissions,
			);

			return result;
		}),

	// Get permission statistics
	getPermissionStats: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Only owners and admins can view permission statistics
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				throw new Error(
					"You don't have permission to view permission statistics",
				);
			}

			// This would typically query the database for permission statistics
			// For now, return a mock response
			return {
				totalUsers: 0,
				usersWithReadOnlyAccess: 0,
				usersWithFullAccess: 0,
				permissionDistribution: {},
			};
		}),

	// Get available resources for permission assignment
	getAvailableResources: protectedProcedure
		.input(
			z.object({
				organizationId: z.string(),
				resourceType: z.enum(["project", "service", "environment"]),
			}),
		)
		.query(async ({ input, ctx }) => {
			// Only owners and admins can view available resources
			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				throw new Error(
					"You don't have permission to view available resources",
				);
			}

			// This would typically query the database for available resources
			// For now, return a mock response
			return {
				resources: [],
				totalCount: 0,
			};
		}),
});
