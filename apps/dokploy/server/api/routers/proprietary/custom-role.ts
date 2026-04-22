import { db } from "@dokploy/server/db";
import { member, organizationRole, user } from "@dokploy/server/db/schema";
import { statements } from "@dokploy/server/lib/access-control";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	enterpriseProcedure,
	protectedProcedure,
} from "../../trpc";
import { audit } from "../../utils/audit";

const permissionsSchema = z.record(z.string(), z.array(z.string()));

export const customRoleRouter = createTRPCRouter({
	all: protectedProcedure.query(async ({ ctx }) => {
		const [roles, memberCounts] = await Promise.all([
			db.query.organizationRole.findMany({
				where: eq(
					organizationRole.organizationId,
					ctx.session.activeOrganizationId,
				),
			}),
			db
				.select({ role: member.role, count: count() })
				.from(member)
				.where(eq(member.organizationId, ctx.session.activeOrganizationId))
				.groupBy(member.role),
		]);

		const memberCountByRole = new Map(
			memberCounts.map((r) => [r.role, r.count]),
		);

		const roleMap = new Map<
			string,
			{
				role: string;
				permissions: Record<string, string[]>;
				createdAt: Date;
				ids: string[];
				memberCount: number;
			}
		>();

		for (const entry of roles) {
			const existing = roleMap.get(entry.role);
			const parsed = JSON.parse(entry.permission) as Record<string, string[]>;

			if (existing) {
				for (const [resource, actions] of Object.entries(parsed)) {
					existing.permissions[resource] = [
						...new Set([...(existing.permissions[resource] ?? []), ...actions]),
					];
				}
				existing.ids.push(entry.id);
			} else {
				roleMap.set(entry.role, {
					role: entry.role,
					permissions: parsed,
					createdAt: entry.createdAt,
					ids: [entry.id],
					memberCount: memberCountByRole.get(entry.role) ?? 0,
				});
			}
		}

		return Array.from(roleMap.values());
	}),

	create: enterpriseProcedure
		.input(
			z.object({
				roleName: z
					.string()
					.min(1)
					.max(50)
					.refine(
						(name) => !["owner", "admin", "member"].includes(name),
						"Cannot use reserved role names (owner, admin, member)",
					),
				permissions: permissionsSchema,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const existingRoles = await db.query.organizationRole.findMany({
				where: eq(
					organizationRole.organizationId,
					ctx.session.activeOrganizationId,
				),
			});

			const uniqueRoleNames = new Set(existingRoles.map((r) => r.role));

			if (uniqueRoleNames.size >= 10) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Maximum of 10 custom roles per organization reached",
				});
			}

			if (uniqueRoleNames.has(input.roleName)) {
				throw new TRPCError({
					code: "CONFLICT",
					message: `Role "${input.roleName}" already exists`,
				});
			}

			validatePermissions(input.permissions);

			const [created] = await db
				.insert(organizationRole)
				.values({
					organizationId: ctx.session.activeOrganizationId,
					role: input.roleName,
					permission: JSON.stringify(input.permissions),
				})
				.returning();

			await audit(ctx, {
				action: "create",
				resourceType: "customRole",
				resourceName: input.roleName,
			});
			return created;
		}),

	update: enterpriseProcedure
		.input(
			z.object({
				roleName: z.string().min(1),
				newRoleName: z
					.string()
					.min(1)
					.max(50)
					.refine(
						(name) => !["owner", "admin", "member"].includes(name),
						"Cannot use reserved role names (owner, admin, member)",
					)
					.optional(),
				permissions: permissionsSchema,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (["owner", "admin", "member"].includes(input.roleName)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot modify built-in roles",
				});
			}

			const effectiveRoleName = input.newRoleName ?? input.roleName;

			if (input.newRoleName && input.newRoleName !== input.roleName) {
				const existing = await db.query.organizationRole.findFirst({
					where: and(
						eq(
							organizationRole.organizationId,
							ctx.session.activeOrganizationId,
						),
						eq(organizationRole.role, input.newRoleName),
					),
				});
				if (existing) {
					throw new TRPCError({
						code: "CONFLICT",
						message: `Role "${input.newRoleName}" already exists`,
					});
				}

				await db
					.update(member)
					.set({ role: input.newRoleName })
					.where(
						and(
							eq(member.organizationId, ctx.session.activeOrganizationId),
							eq(member.role, input.roleName),
						),
					);
			}

			validatePermissions(input.permissions);

			const [updated] = await db
				.update(organizationRole)
				.set({
					role: effectiveRoleName,
					permission: JSON.stringify(input.permissions),
				})
				.where(
					and(
						eq(
							organizationRole.organizationId,
							ctx.session.activeOrganizationId,
						),
						eq(organizationRole.role, input.roleName),
					),
				)
				.returning();

			await audit(ctx, {
				action: "update",
				resourceType: "customRole",
				resourceName: effectiveRoleName,
			});
			return updated;
		}),

	remove: enterpriseProcedure
		.input(
			z.object({
				roleName: z.string().min(1),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (["owner", "admin", "member"].includes(input.roleName)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot delete built-in roles",
				});
			}

			const assignedMembers = await db.query.member.findMany({
				where: and(
					eq(member.organizationId, ctx.session.activeOrganizationId),
					eq(member.role, input.roleName),
				),
			});

			if (assignedMembers.length > 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Cannot delete role "${input.roleName}": ${assignedMembers.length} member(s) are currently assigned to it. Reassign them first.`,
				});
			}

			const deleted = await db
				.delete(organizationRole)
				.where(
					and(
						eq(
							organizationRole.organizationId,
							ctx.session.activeOrganizationId,
						),
						eq(organizationRole.role, input.roleName),
					),
				)
				.returning();

			if (deleted.length === 0) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: `Role "${input.roleName}" not found`,
				});
			}

			await audit(ctx, {
				action: "delete",
				resourceType: "customRole",
				resourceName: input.roleName,
			});
			return { deleted: deleted.length };
		}),

	membersByRole: protectedProcedure
		.input(z.object({ roleName: z.string().min(1) }))
		.query(async ({ input, ctx }) => {
			const members = await db
				.select({
					id: member.id,
					userId: member.userId,
					email: user.email,
					firstName: user.firstName,
					lastName: user.lastName,
				})
				.from(member)
				.innerJoin(user, eq(member.userId, user.id))
				.where(
					and(
						eq(member.organizationId, ctx.session.activeOrganizationId),
						eq(member.role, input.roleName),
					),
				);
			return members;
		}),

	getStatements: protectedProcedure.query(() => {
		return statements;
	}),
});

const INTERNAL_RESOURCES = ["organization", "invitation", "team", "ac"];

function validatePermissions(permissions: Record<string, string[]>) {
	for (const [resource, actions] of Object.entries(permissions)) {
		if (INTERNAL_RESOURCES.includes(resource)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Resource "${resource}" is managed internally and cannot be assigned to custom roles`,
			});
		}

		if (!(resource in statements)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Unknown resource: ${resource}`,
			});
		}

		const validActions = statements[resource as keyof typeof statements];
		for (const action of actions) {
			if (!validActions.includes(action as never)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Invalid action "${action}" for resource "${resource}". Valid actions: ${validActions.join(", ")}`,
				});
			}
		}
	}
}
