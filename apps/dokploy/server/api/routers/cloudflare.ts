import {
	checkCloudflareDomainAvailability,
	createCloudflare,
	findCloudflareById,
	listTunnels,
	removeCloudflareById,
	testCloudflareConnection,
	updateCloudflareById,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateCloudflare,
	apiFindOneCloudflare,
	apiRemoveCloudflare,
	apiTestCloudflareConnection,
	apiUpdateCloudflare,
	cloudflare,
	cloudflareTunnelRuntime,
	domains,
} from "@/server/db/schema";

/**
 * Strips the stored API token before a Cloudflare integration row is returned
 * to the client. The token is write-only from the dashboard's perspective.
 */
const redactCloudflare = <T extends { apiToken?: string }>(row: T) => {
	const { apiToken: _apiToken, ...rest } = row;
	return rest;
};

/**
 * Loads a Cloudflare integration and verifies it belongs to the caller's active
 * organization, throwing UNAUTHORIZED otherwise. Shared by the org-scoped
 * one/remove/update procedures.
 */
const getCloudflareInOrg = async (
	cloudflareId: string,
	activeOrganizationId: string,
) => {
	const integration = await findCloudflareById(cloudflareId);
	if (integration.organizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this Cloudflare integration",
		});
	}
	return integration;
};

/**
 * Cloudflare integration credentials (org-scoped).
 *
 * Every procedure is gated with `adminProcedure` rather than
 * `withPermission("cloudflare", …)`: because `cloudflare` is an
 * enterprise-only resource, `checkPermission` short-circuits the permission
 * check for static roles (including `member`), which would otherwise let a
 * member mutate org-wide Cloudflare credentials. `adminProcedure` enforces an
 * owner/admin role directly.
 */
export const cloudflareRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateCloudflare)
		.mutation(async ({ input, ctx }) => {
			try {
				const result = await createCloudflare(
					input,
					ctx.session.activeOrganizationId,
				);
				await audit(ctx, {
					action: "create",
					resourceType: "cloudflare",
					resourceId: result.cloudflareId,
					resourceName: input.name,
				});
				return redactCloudflare(result);
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error creating the Cloudflare integration",
					cause: error,
				});
			}
		}),
	testConnection: adminProcedure
		.input(apiTestCloudflareConnection)
		.mutation(async ({ input, ctx }) => {
			try {
				// On the edit flow the token field is blank (write-only), so fall back
				// to the stored token of the in-org integration. getCloudflareInOrg also
				// enforces that the integration belongs to the caller's organization.
				let apiToken = input.apiToken;
				if (!apiToken && input.cloudflareId) {
					const integration = await getCloudflareInOrg(
						input.cloudflareId,
						ctx.session.activeOrganizationId,
					);
					apiToken = integration.apiToken;
				}
				if (!apiToken) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "An API token is required to test the connection",
					});
				}
				await testCloudflareConnection({
					apiToken,
					accountId: input.accountId,
				});
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error connecting to Cloudflare",
					cause: error,
				});
			}
		}),
	one: adminProcedure
		.input(apiFindOneCloudflare)
		.query(async ({ input, ctx }) => {
			const integration = await getCloudflareInOrg(
				input.cloudflareId,
				ctx.session.activeOrganizationId,
			);
			return redactCloudflare(integration);
		}),
	all: adminProcedure.query(async ({ ctx }) => {
		const rows = await db.query.cloudflare.findMany({
			where: eq(cloudflare.organizationId, ctx.session.activeOrganizationId),
			orderBy: [desc(cloudflare.createdAt)],
		});
		return rows.map(redactCloudflare);
	}),
	tunnels: adminProcedure
		.input(apiFindOneCloudflare)
		.query(async ({ input, ctx }) => {
			const integration = await getCloudflareInOrg(
				input.cloudflareId,
				ctx.session.activeOrganizationId,
			);
			const tunnels = await listTunnels(
				integration.apiToken,
				integration.accountId,
			);
			// Only remotely-managed tunnels can be driven by Dokploy.
			return tunnels.filter((tunnel) => tunnel.config_src === "cloudflare");
		}),
	// Advisory pre-check the domain form runs before submit: would publishing
	// this host collide with a Cloudflare record/route Dokploy doesn't own?
	checkDomainAvailability: adminProcedure
		.input(
			z.object({
				cloudflareId: z.string().min(1),
				host: z.string().trim().min(1),
				tunnelId: z.string().optional(),
			}),
		)
		.query(async ({ input, ctx }) => {
			const integration = await getCloudflareInOrg(
				input.cloudflareId,
				ctx.session.activeOrganizationId,
			);
			return checkCloudflareDomainAvailability({
				apiToken: integration.apiToken,
				accountId: integration.accountId,
				host: input.host,
				tunnelId: input.tunnelId,
			});
		}),
	tunnelRuntimes: adminProcedure
		.input(z.object({ cloudflareId: z.string().min(1) }).optional())
		.query(async ({ input, ctx }) => {
			return db.query.cloudflareTunnelRuntime.findMany({
				where: input?.cloudflareId
					? and(
							eq(
								cloudflareTunnelRuntime.organizationId,
								ctx.session.activeOrganizationId,
							),
							eq(cloudflareTunnelRuntime.cloudflareId, input.cloudflareId),
						)
					: eq(
							cloudflareTunnelRuntime.organizationId,
							ctx.session.activeOrganizationId,
						),
				orderBy: [desc(cloudflareTunnelRuntime.createdAt)],
			});
		}),
	remove: adminProcedure
		.input(apiRemoveCloudflare)
		.mutation(async ({ input, ctx }) => {
			const integration = await getCloudflareInOrg(
				input.cloudflareId,
				ctx.session.activeOrganizationId,
			);
			// Block deletion while domains are still published through this
			// integration — otherwise the FK sets domain.cloudflareId to null and
			// their live DNS/ingress/connector state can no longer be cleaned up.
			const published = await db.query.domains.findMany({
				where: and(
					eq(domains.cloudflareId, input.cloudflareId),
					eq(domains.publishToCloudflare, true),
				),
				columns: { domainId: true, host: true },
			});
			if (published.length > 0) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: `Cannot delete this Cloudflare integration: ${published.length} domain(s) are still published through it (e.g. ${published[0]?.host}). Unpublish them first.`,
				});
			}
			const result = await removeCloudflareById(
				input.cloudflareId,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "cloudflare",
				resourceId: input.cloudflareId,
				resourceName: integration.name,
			});
			return result ? redactCloudflare(result) : undefined;
		}),
	update: adminProcedure
		.input(apiUpdateCloudflare)
		.mutation(async ({ input, ctx }) => {
			const integration = await getCloudflareInOrg(
				input.cloudflareId,
				ctx.session.activeOrganizationId,
			);
			// Changing the Cloudflare account strands everything already
			// provisioned under the old account: published domains keep their old
			// zone/tunnel/record ids, but cleanup would then run with credentials
			// for a different account and silently fail. Block it (like delete)
			// while any domain is still published through this integration.
			if (input.accountId && input.accountId !== integration.accountId) {
				const published = await db.query.domains.findMany({
					where: and(
						eq(domains.cloudflareId, input.cloudflareId),
						eq(domains.publishToCloudflare, true),
					),
					columns: { host: true },
				});
				if (published.length > 0) {
					throw new TRPCError({
						code: "PRECONDITION_FAILED",
						message: `Cannot change the Cloudflare account while ${published.length} domain(s) are published through this integration (e.g. ${published[0]?.host}). Unpublish them first.`,
					});
				}
			}
			try {
				const { cloudflareId, apiToken, ...rest } = input;
				const result = await updateCloudflareById(
					cloudflareId,
					ctx.session.activeOrganizationId,
					{
						...rest,
						// Only overwrite the token when a new one is supplied.
						...(apiToken ? { apiToken } : {}),
					},
				);
				await audit(ctx, {
					action: "update",
					resourceType: "cloudflare",
					resourceId: cloudflareId,
					resourceName: input.name,
				});
				return result ? redactCloudflare(result) : undefined;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error updating the Cloudflare integration",
					cause: error,
				});
			}
		}),
});
