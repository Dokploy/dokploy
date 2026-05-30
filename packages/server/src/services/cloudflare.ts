import { db } from "@dokploy/server/db";
import {
	type apiCreateCloudflare,
	cloudflare,
} from "@dokploy/server/db/schema";
import {
	CloudflareApiError,
	listTunnels,
	verifyToken,
} from "@dokploy/server/utils/providers/cloudflare";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import type { z } from "zod";

export type Cloudflare = typeof cloudflare.$inferSelect;

export interface OrgCloudflarePolicy {
	/** The org's integrations, most-recent first (for per-host selection). */
	integrations: Cloudflare[];
	/** OR-ed across integrations so the most-restrictive setting wins. */
	protectDomainsByDefault: boolean;
	requireProtectedDomains: boolean;
}

/**
 * Resolves the org-wide Cloudflare Access policy. The policy is conceptually
 * organization-level; with the supported single-integration setup it is just
 * that integration's settings. If an org somehow has several integrations the
 * policy booleans are OR-ed (most-restrictive wins) and the actual provisioning
 * credentials are chosen per-host by zone ownership (`selectIntegrationForHost`).
 * Returns null when the org has no Cloudflare integration (policy inactive).
 */
export const resolveOrgCloudflarePolicy = async (
	organizationId: string,
): Promise<OrgCloudflarePolicy | null> => {
	const integrations = await db.query.cloudflare.findMany({
		where: eq(cloudflare.organizationId, organizationId),
		orderBy: [desc(cloudflare.createdAt)],
	});
	if (integrations.length === 0) {
		return null;
	}
	return {
		integrations,
		protectDomainsByDefault: integrations.some(
			(i) => i.protectDomainsByDefault,
		),
		requireProtectedDomains: integrations.some(
			(i) => i.requireProtectedDomains,
		),
	};
};

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
 * Validates a set of Cloudflare credentials without persisting them:
 *  1. the API token is valid and active (`GET /user/tokens/verify`), and
 *  2. it can actually operate on the account by listing its tunnels.
 *
 * Step 2 probes the integration's core capability instead of reading the
 * account object (`GET /accounts/{id}`) — that endpoint returns a misleading
 * "Account not found" for single-account-scoped tokens and needs an extra
 * "Account Settings: Read" permission the integration never uses. Listing
 * tunnels exercises the exact permission + network path publishing relies on,
 * so the test fails up-front (rather than at publish time) when the token lacks
 * Cloudflare Tunnel access, the account has API access disabled, or a token IP
 * allowlist excludes this server.
 */
export const testCloudflareConnection = async (input: {
	apiToken: string;
	accountId: string;
}) => {
	await verifyToken(input.apiToken);
	try {
		await listTunnels(input.apiToken, input.accountId);
	} catch (error) {
		const detail = error instanceof Error ? error.message : String(error);
		throw new CloudflareApiError(
			`The API token is valid, but it can't manage tunnels in account ${input.accountId} (${detail}). ` +
				`Check that the token has the "Cloudflare Tunnel" permission scoped to this account, ` +
				"that the account has API access enabled, and that any IP allowlist on the token includes this server.",
		);
	}
};
