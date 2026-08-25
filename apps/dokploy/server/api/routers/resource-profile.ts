import {
	createResourceGroup,
	createResourceProfile,
	findComposeServiceAssignments,
	findResourceGroupsByOrganization,
	findResourceProfileById,
	getProfilesUsageCounts,
	removeComposeServiceAssignment,
	removeResourceGroupById,
	removeResourceProfileById,
	saveComposeServiceAssignment,
	updateResourceGroupById,
	updateResourceProfileById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import {
	apiAssignComposeServiceProfile,
	apiCreateResourceGroup,
	apiCreateResourceProfile,
	apiFindOneResourceGroup,
	apiFindOneResourceProfile,
	apiRemoveComposeServiceProfile,
	apiRemoveResourceGroup,
	apiRemoveResourceProfile,
	apiUpdateResourceGroup,
	apiUpdateResourceProfile,
	resourceGroup,
} from "@dokploy/server/db/schema";
import { db } from "@dokploy/server/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";

const apiSaveComposeServices = z.object({
	composeId: z.string().min(1),
	services: z.array(apiAssignComposeServiceProfile.omit({ composeId: true })),
});

export const resourceProfileRouter = createTRPCRouter({
	all: withPermission("resourceProfiles", "read").query(async ({ ctx }) => {
		const organizationId = ctx.session.activeOrganizationId;
		const groups = await findResourceGroupsByOrganization(organizationId);
		const profileIds = groups.flatMap((g) =>
			g.profiles.map((p) => p.profileId),
		);
		const usageCounts = await getProfilesUsageCounts(profileIds);
		return groups.map((group) => ({
			...group,
			profiles: group.profiles.map((profile) => ({
				...profile,
				usageCount: usageCounts.get(profile.profileId) || 0,
			})),
		}));
	}),
	oneGroup: withPermission("resourceProfiles", "read")
		.input(apiFindOneResourceGroup)
		.query(async ({ input, ctx }) => {
			const group = await db.query.resourceGroup.findFirst({
				where: eq(resourceGroup.groupId, input.groupId),
				with: { profiles: true },
			});
			if (!group || group.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Resource group not found",
				});
			}
			return group;
		}),
	oneProfile: withPermission("resourceProfiles", "read")
		.input(apiFindOneResourceProfile)
		.query(async ({ input }) => {
			const profile = await findResourceProfileById(input.profileId);
			if (!profile) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Resource profile not found",
				});
			}
			return profile;
		}),
	createGroup: withPermission("resourceProfiles", "create")
		.input(apiCreateResourceGroup)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createResourceGroup(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "resourceProfile",
					resourceId: result.groupId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the resource group",
					cause: error,
				});
			}
		}),
	updateGroup: withPermission("resourceProfiles", "update")
		.input(apiUpdateResourceGroup)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await updateResourceGroupById(input);
				await audit(ctx, {
					action: "update",
					resourceType: "resourceProfile",
					resourceId: input.groupId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the resource group",
					cause: error,
				});
			}
		}),
	removeGroup: withPermission("resourceProfiles", "delete")
		.input(apiRemoveResourceGroup)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await removeResourceGroupById(
					input.groupId,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "delete",
					resourceType: "resourceProfile",
					resourceId: input.groupId,
					resourceName: result?.name ?? "",
				});
				return result;
			} catch (error) {
				if (error instanceof TRPCError && error.code === "CONFLICT") {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting the resource group",
					cause: error,
				});
			}
		}),
	createProfile: withPermission("resourceProfiles", "create")
		.input(apiCreateResourceProfile)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createResourceProfile(input);
				await audit(ctx, {
					action: "create",
					resourceType: "resourceProfile",
					resourceId: result.profileId,
					resourceName: input.name,
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the resource profile",
					cause: error,
				});
			}
		}),
	updateProfile: withPermission("resourceProfiles", "update")
		.input(apiUpdateResourceProfile)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await updateResourceProfileById(input);
				await audit(ctx, {
					action: "update",
					resourceType: "resourceProfile",
					resourceId: input.profileId,
					resourceName: input.name ?? "",
				});
				return result;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the resource profile",
					cause: error,
				});
			}
		}),
	removeProfile: withPermission("resourceProfiles", "delete")
		.input(apiRemoveResourceProfile)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await removeResourceProfileById(
					input.profileId,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "delete",
					resourceType: "resourceProfile",
					resourceId: input.profileId,
					resourceName: result?.name ?? "",
				});
				return result;
			} catch (error) {
				if (error instanceof TRPCError && error.code === "CONFLICT") {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error deleting the resource profile",
					cause: error,
				});
			}
		}),
	composeAssignments: protectedProcedure
		.input(z.object({ composeId: z.string().min(1) }))
		.query(async ({ input }) => {
			return await findComposeServiceAssignments(input.composeId);
		}),
	saveComposeAssignments: protectedProcedure
		.input(apiSaveComposeServices)
		.mutation(async ({ input }) => {
			for (const service of input.services) {
				await saveComposeServiceAssignment({
					...service,
					composeId: input.composeId,
				});
			}
			return true;
		}),
	removeComposeAssignment: protectedProcedure
		.input(apiRemoveComposeServiceProfile)
		.mutation(async ({ input }) => {
			return await removeComposeServiceAssignment(input.composeServiceId);
		}),
});
