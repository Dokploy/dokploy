import { db } from "@dokploy/server/db";
import {
	member,
	organization,
	organizationRole,
	user,
} from "@dokploy/server/db/schema";
import { statements } from "@dokploy/server/lib/access-control";
import { DOMAIN_PATTERN_REGEX } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	enterpriseProcedure,
	protectedProcedure,
	requireSensitiveVerification,
} from "../../trpc";
import { audit } from "../../utils/audit";

const permissionsSchema = z.record(z.string(), z.array(z.string()));

const allowedDomainsSchema = z
	.array(z.string())
	.transform((list) => [
		...new Set(list.map((d) => d.trim().toLowerCase()).filter(Boolean)),
	])
	.refine((list) => list.every((d) => DOMAIN_PATTERN_REGEX.test(d)), {
		message: "Allowed domains must be wildcards like *.lab.example.com",
	});

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
				allowedDomains: string[];
				requireHttps: boolean;
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
				existing.allowedDomains = [
					...new Set([
						...existing.allowedDomains,
						...(entry.allowedDomains ?? []),
					]),
				];
				existing.requireHttps ||= entry.requireHttps;
				existing.ids.push(entry.id);
			} else {
				roleMap.set(entry.role, {
					role: entry.role,
					permissions: parsed,
					allowedDomains: entry.allowedDomains ?? [],
					requireHttps: entry.requireHttps,
					createdAt: entry.createdAt,
					ids: [entry.id],
					memberCount: memberCountByRole.get(entry.role) ?? 0,
				});
			}
		}

		return Array.from(roleMap.values());
	}),

	create: enterpriseProcedure
		.use(requireSensitiveVerification)
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
				allowedDomains: allowedDomainsSchema.optional(),
				requireHttps: z.boolean().optional(),
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
			validateDomainRestriction(input.permissions, input.allowedDomains);

			const [created] = await db
				.insert(organizationRole)
				.values({
					organizationId: ctx.session.activeOrganizationId,
					role: input.roleName,
					permission: JSON.stringify(input.permissions),
					allowedDomains: input.allowedDomains?.length
						? input.allowedDomains
						: null,
					requireHttps: input.requireHttps ?? false,
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
		.use(requireSensitiveVerification)
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
				allowedDomains: allowedDomainsSchema.optional(),
				requireHttps: z.boolean().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			if (["owner", "admin", "member"].includes(input.roleName)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cannot modify built-in roles",
				});
			}

			validatePermissions(input.permissions);

			let allowedDomains = input.allowedDomains;
			if (allowedDomains === undefined) {
				const rows = await db.query.organizationRole.findMany({
					where: and(
						eq(
							organizationRole.organizationId,
							ctx.session.activeOrganizationId,
						),
						eq(organizationRole.role, input.roleName),
					),
					columns: { allowedDomains: true },
				});
				allowedDomains = rows.flatMap((row) => row.allowedDomains ?? []);
			}
			validateDomainRestriction(input.permissions, allowedDomains);

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

			const [updated] = await db
				.update(organizationRole)
				.set({
					role: effectiveRoleName,
					permission: JSON.stringify(input.permissions),
					...(input.allowedDomains !== undefined && {
						allowedDomains: input.allowedDomains.length
							? input.allowedDomains
							: null,
					}),
					...(input.requireHttps !== undefined && {
						requireHttps: input.requireHttps,
					}),
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
		.use(requireSensitiveVerification)
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

			await db
				.update(organization)
				.set({ defaultRole: null })
				.where(
					and(
						eq(organization.id, ctx.session.activeOrganizationId),
						eq(organization.defaultRole, input.roleName),
					),
				);

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

// Both can publish any host outside the domain checks: traefikFiles:write by
// editing router configs, server.terminal through a root shell on the host.
function validateDomainRestriction(
	permissions: Record<string, string[]>,
	allowedDomains: string[] | undefined,
) {
	if (!allowedDomains?.length) return;
	if (
		permissions.traefikFiles?.includes("write") ||
		permissions.server?.includes("terminal")
	) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Roles with allowed domains cannot have Traefik files write or server terminal permissions",
		});
	}
}
