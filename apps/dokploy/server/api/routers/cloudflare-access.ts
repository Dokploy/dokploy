import {
	deprovisionCloudflareAccessForDomain,
	findAccessApplicationByDomainId,
	findCloudflareById,
	findDomainById,
	provisionCloudflareAccessForDomain,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiFindCloudflareAccessByDomain,
	apiUpsertCloudflareAccess,
} from "@/server/db/schema";

/**
 * Loads a domain and verifies that the Cloudflare integration it publishes
 * through belongs to the caller's active organization. Access can only be
 * configured for a domain that is published via Cloudflare.
 */
const resolvePublishedDomainInOrg = async (
	domainId: string,
	activeOrganizationId: string,
) => {
	const domain = await findDomainById(domainId);
	if (!domain.publishToCloudflare || !domain.cloudflareId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This domain is not published via Cloudflare; publish it before configuring Access",
		});
	}
	const integration = await findCloudflareById(domain.cloudflareId);
	if (integration.organizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Cloudflare integration not found in this organization",
		});
	}
	return domain;
};

/** Ensures an Access application row belongs to the caller's organization. */
const assertAppInOrg = (
	app: { organizationId: string },
	activeOrganizationId: string,
) => {
	if (app.organizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this resource",
		});
	}
};

/**
 * Cloudflare Access (Zero Trust) configuration for published domains. Every
 * procedure is admin-gated (same rationale as the Cloudflare credential router:
 * `checkPermission` would bypass an enterprise-resource check for static roles).
 */
export const cloudflareAccessRouter = createTRPCRouter({
	byDomainId: adminProcedure
		.input(apiFindCloudflareAccessByDomain)
		.query(async ({ input, ctx }) => {
			const app = await findAccessApplicationByDomainId(input.domainId);
			if (app) {
				assertAppInOrg(app, ctx.session.activeOrganizationId);
			}
			return app ?? null;
		}),
	upsert: adminProcedure
		.input(apiUpsertCloudflareAccess)
		.mutation(async ({ input, ctx }) => {
			const domain = await resolvePublishedDomainInOrg(
				input.domainId,
				ctx.session.activeOrganizationId,
			);
			try {
				const result = await provisionCloudflareAccessForDomain(domain, {
					sessionDuration: input.sessionDuration,
					allowEmails: input.allowEmails,
					allowEmailDomains: input.allowEmailDomains,
				});
				await audit(ctx, {
					action: "update",
					resourceType: "cloudflare",
					resourceId: domain.domainId,
					resourceName: `Access: ${domain.host}`,
				});
				return result;
			} catch (error) {
				if (error instanceof TRPCError) {
					throw error;
				}
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error configuring Cloudflare Access",
					cause: error,
				});
			}
		}),
	remove: adminProcedure
		.input(apiFindCloudflareAccessByDomain)
		.mutation(async ({ input, ctx }) => {
			const app = await findAccessApplicationByDomainId(input.domainId);
			if (!app) {
				return;
			}
			assertAppInOrg(app, ctx.session.activeOrganizationId);
			const domain = await findDomainById(input.domainId);
			await deprovisionCloudflareAccessForDomain(domain);
			await audit(ctx, {
				action: "delete",
				resourceType: "cloudflare",
				resourceId: domain.domainId,
				resourceName: `Access: ${domain.host}`,
			});
		}),
});
