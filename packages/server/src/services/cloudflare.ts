import { db } from "@dokploy/server/db";
import {
	type apiCreateCloudflare,
	cloudflare,
} from "@dokploy/server/db/schema";
import { verifyToken } from "@dokploy/server/utils/providers/cloudflare";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";

export type Cloudflare = typeof cloudflare.$inferSelect;

export const createCloudflare = async (
	input: z.infer<typeof apiCreateCloudflare>,
	organizationId: string,
) => {
	const newCloudflare = await db
		.insert(cloudflare)
		.values({
			...input,
			organizationId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newCloudflare) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the Cloudflare integration",
		});
	}

	return newCloudflare;
};

export const findCloudflareById = async (cloudflareId: string) => {
	const result = await db.query.cloudflare.findFirst({
		where: eq(cloudflare.cloudflareId, cloudflareId),
	});
	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Cloudflare integration not found",
		});
	}
	return result;
};

export const removeCloudflareById = async (
	cloudflareId: string,
	organizationId: string,
) => {
	const result = await db
		.delete(cloudflare)
		.where(
			and(
				eq(cloudflare.cloudflareId, cloudflareId),
				eq(cloudflare.organizationId, organizationId),
			),
		)
		.returning();

	return result[0];
};

export const updateCloudflareById = async (
	cloudflareId: string,
	organizationId: string,
	cloudflareData: Partial<Cloudflare>,
) => {
	const result = await db
		.update(cloudflare)
		.set({
			...cloudflareData,
		})
		.where(
			and(
				eq(cloudflare.cloudflareId, cloudflareId),
				eq(cloudflare.organizationId, organizationId),
			),
		)
		.returning();

	return result[0];
};

/**
 * Validates a set of Cloudflare credentials without persisting them by
 * confirming the API token is valid and active (`GET /user/tokens/verify`).
 *
 * Deliberately avoids `GET /accounts/{id}`: that endpoint returns a misleading
 * "Account not found" for single-account-scoped tokens, and reading the account
 * object would require an extra "Account Settings: Read" permission the
 * integration never otherwise uses.
 */
export const testCloudflareConnection = async (input: {
	apiToken: string;
	accountId: string;
}) => {
	await verifyToken(input.apiToken);
};
