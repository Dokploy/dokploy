import {
	createTrustPolicy,
	findTrustPolicyById,
	removeTrustPolicy,
	updateTrustPolicy,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateTrustPolicy,
	apiFindOneTrustPolicy,
	apiRemoveTrustPolicy,
	apiUpdateTrustPolicy,
	trustPolicy,
} from "@/server/db/schema";
import { adminProcedure, createTRPCRouter } from "../trpc";

export const trustPolicyRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateTrustPolicy)
		.mutation(async ({ ctx, input }) => {
			const policy = await createTrustPolicy(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "trustPolicy",
				resourceId: policy.trustPolicyId,
				resourceName: policy.name,
			});
			return policy;
		}),

	update: adminProcedure
		.input(apiUpdateTrustPolicy)
		.mutation(async ({ ctx, input }) => {
			const { trustPolicyId, ...rest } = input;
			const existing = await findTrustPolicyById(trustPolicyId);
			if (existing.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			const updated = await updateTrustPolicy(trustPolicyId, rest);
			if (!updated) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating trust policy",
				});
			}
			await audit(ctx, {
				action: "update",
				resourceType: "trustPolicy",
				resourceId: trustPolicyId,
				resourceName: existing.name,
			});
			return true;
		}),

	remove: adminProcedure
		.input(apiRemoveTrustPolicy)
		.mutation(async ({ ctx, input }) => {
			const existing = await findTrustPolicyById(input.trustPolicyId);
			if (existing.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			await audit(ctx, {
				action: "delete",
				resourceType: "trustPolicy",
				resourceId: existing.trustPolicyId,
				resourceName: existing.name,
			});
			return await removeTrustPolicy(input.trustPolicyId);
		}),

	one: adminProcedure
		.input(apiFindOneTrustPolicy)
		.query(async ({ ctx, input }) => {
			const existing = await findTrustPolicyById(input.trustPolicyId);
			if (existing.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({ code: "UNAUTHORIZED" });
			}
			return existing;
		}),

	all: adminProcedure.query(async ({ ctx }) => {
		return db.query.trustPolicy.findMany({
			where: eq(trustPolicy.organizationId, ctx.session.activeOrganizationId),
		});
	}),
});
