import { eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "../db";
import {
	type apiCreateTrustPolicy,
	type TrustPolicy,
	trustPolicy,
} from "../db/schema";

export const createTrustPolicy = async (
	input: z.infer<typeof apiCreateTrustPolicy>,
	organizationId: string,
): Promise<TrustPolicy> => {
	const result = await db
		.insert(trustPolicy)
		.values({ ...input, organizationId })
		.returning();
	if (!result[0]) {
		throw new Error("Error creating the trust policy");
	}
	return result[0];
};

export const findTrustPolicyById = async (
	trustPolicyId: string,
): Promise<TrustPolicy> => {
	const result = await db.query.trustPolicy.findFirst({
		where: eq(trustPolicy.trustPolicyId, trustPolicyId),
	});
	if (!result) {
		throw new Error("Trust policy not found");
	}
	return result;
};

export const updateTrustPolicy = async (
	trustPolicyId: string,
	data: Partial<TrustPolicy>,
): Promise<TrustPolicy | undefined> => {
	const result = await db
		.update(trustPolicy)
		.set({ ...data })
		.where(eq(trustPolicy.trustPolicyId, trustPolicyId))
		.returning();
	return result[0];
};

export const removeTrustPolicy = async (
	trustPolicyId: string,
): Promise<TrustPolicy> => {
	const result = await db
		.delete(trustPolicy)
		.where(eq(trustPolicy.trustPolicyId, trustPolicyId))
		.returning();
	if (!result[0]) {
		throw new Error("Error removing the trust policy");
	}
	return result[0];
};
