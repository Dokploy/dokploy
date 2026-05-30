import {
	createDomain,
	deprovisionCloudflareForDomain,
	findApplicationById,
	findCloudflareById,
	findDomainById,
	findDomainsByApplicationId,
	findDomainsByComposeId,
	findPreviewDeploymentById,
	findServerById,
	generateTraefikMeDomain,
	getWebServerSettings,
	isCloudflarePublished,
	manageDomain,
	provisionCloudflareForDomain,
	removeCloudflareRoute,
	removeDomain,
	removeDomainById,
	updateDomainById,
	validateDomain,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateDomain,
	apiFindCompose,
	apiFindDomain,
	apiFindOneApplication,
	apiUpdateDomain,
} from "@/server/db/schema";

/**
 * Publishing a domain via Cloudflare triggers org-wide DNS/Tunnel changes, so it
 * requires an owner/admin even when the caller has service-level `domain:create`.
 * (`checkPermission` would bypass an enterprise-resource check for static roles,
 * so the role is asserted directly here.)
 */
const requireCloudflareAdmin = (ctx: { user: { role: string } }) => {
	if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message:
				"Only organization owners or admins can publish domains via Cloudflare",
		});
	}
};

/**
 * Confirms the selected Cloudflare integration belongs to the caller's active
 * organization, preventing an admin from publishing through another org's
 * credentials by passing a foreign `cloudflareId`.
 */
const assertCloudflareIntegrationInOrg = async (
	cloudflareId: string,
	activeOrganizationId: string,
) => {
	const integration = await findCloudflareById(cloudflareId);
	if (integration.organizationId !== activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Cloudflare integration not found in this organization",
		});
	}
};

export const domainRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDomain)
		.mutation(async ({ input, ctx }) => {
			try {
				// Gate by the service the domain attaches to, keyed off the id(s)
				// present rather than `domainType` (which is optional and defaults to
				// "application"). Both ids are checked independently so a caller can't
				// pass an authorized composeId alongside an unauthorized applicationId
				// to skip the application check.
				if (input.composeId) {
					await checkServicePermissionAndAccess(ctx, input.composeId, {
						domain: ["create"],
					});
				}
				if (input.applicationId) {
					await checkServicePermissionAndAccess(ctx, input.applicationId, {
						domain: ["create"],
					});
				}
				if (input.publishToCloudflare) {
					requireCloudflareAdmin(ctx);
					if (input.cloudflareId) {
						await assertCloudflareIntegrationInOrg(
							input.cloudflareId,
							ctx.session.activeOrganizationId,
						);
					}
				}
				const domain = await createDomain(input);
				await audit(ctx, {
					action: "create",
					resourceType: "domain",
					resourceId: domain.domainId,
					resourceName: domain.host,
				});
				if (isCloudflarePublished(domain)) {
					await provisionCloudflareForDomain(domain);
				}
				return domain;
			} catch (error) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						error instanceof Error
							? error.message
							: "Error creating the domain",
					cause: error,
				});
			}
		}),
	byApplicationId: protectedProcedure
		.input(apiFindOneApplication)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				domain: ["read"],
			});
			return await findDomainsByApplicationId(input.applicationId);
		}),
	byComposeId: protectedProcedure
		.input(apiFindCompose)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.composeId, {
				domain: ["read"],
			});
			return await findDomainsByComposeId(input.composeId);
		}),
	generateDomain: withPermission("domain", "create")
		.input(z.object({ appName: z.string(), serverId: z.string().optional() }))
		.mutation(async ({ input, ctx }) => {
			return generateTraefikMeDomain(
				input.appName,
				ctx.user.ownerId,
				input.serverId,
			);
		}),
	canGenerateTraefikMeDomains: withPermission("domain", "read")
		.input(z.object({ serverId: z.string() }))
		.query(async ({ input }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				return server.ipAddress;
			}
			const settings = await getWebServerSettings();
			return settings?.serverIp || "";
		}),

	update: protectedProcedure
		.input(apiUpdateDomain)
		.mutation(async ({ input, ctx }) => {
			const currentDomain = await findDomainById(input.domainId);
			const serviceId = currentDomain.applicationId || currentDomain.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					domain: ["create"],
				});
			} else if (currentDomain.previewDeploymentId) {
				const preview = await findPreviewDeploymentById(
					currentDomain.previewDeploymentId,
				);
				await checkServicePermissionAndAccess(ctx, preview.applicationId, {
					domain: ["create"],
				});
			}

			if (
				input.publishToCloudflare ||
				currentDomain.publishToCloudflare ||
				input.cloudflareId
			) {
				requireCloudflareAdmin(ctx);
				// Validate whenever an integration id is supplied — not only when
				// publishToCloudflare is also set. An already-published domain could
				// otherwise be repointed at another org's integration by omitting
				// publishToCloudflare, since the row stays published and then
				// provisions against the foreign token.
				if (input.cloudflareId) {
					await assertCloudflareIntegrationInOrg(
						input.cloudflareId,
						ctx.session.activeOrganizationId,
					);
				}
			}

			const result = await updateDomainById(input.domainId, input);
			const domain = await findDomainById(input.domainId);
			await audit(ctx, {
				action: "update",
				resourceType: "domain",
				resourceId: domain.domainId,
				resourceName: domain.host,
			});
			if (domain.applicationId) {
				const application = await findApplicationById(domain.applicationId);
				await manageDomain(application, domain);
			} else if (domain.previewDeploymentId) {
				const previewDeployment = await findPreviewDeploymentById(
					domain.previewDeploymentId,
				);
				const application = await findApplicationById(
					previewDeployment.applicationId,
				);
				application.appName = previewDeployment.appName;
				await manageDomain(application, domain);
			}

			// Reconcile Cloudflare publishing for this domain.
			if (isCloudflarePublished(domain)) {
				// If the Cloudflare target changed on an already-published domain
				// (host, integration, zone, tunnel, or mode), clean the old route
				// before publishing the new one.
				const targetChanged =
					currentDomain.publishToCloudflare &&
					(currentDomain.host !== domain.host ||
						currentDomain.cloudflareId !== domain.cloudflareId ||
						currentDomain.cloudflareZoneId !== domain.cloudflareZoneId ||
						currentDomain.cloudflareTunnelId !== domain.cloudflareTunnelId ||
						currentDomain.cloudflareTunnelMode !== domain.cloudflareTunnelMode);
				if (targetChanged) {
					const tunnelIdentityChanged =
						currentDomain.cloudflareId !== domain.cloudflareId ||
						currentDomain.cloudflareTunnelId !== domain.cloudflareTunnelId ||
						currentDomain.cloudflareTunnelMode !== domain.cloudflareTunnelMode;
					if (tunnelIdentityChanged) {
						// The domain now points at a different tunnel/integration, so the
						// old shared connector + tunnel may be orphaned — fully deprovision
						// (route removal + tunnel teardown), not just the per-host route.
						await deprovisionCloudflareForDomain(currentDomain);
					} else {
						// Same tunnel, only host/zone moved — drop the old route only so a
						// shared tunnel still used by siblings stays up.
						await removeCloudflareRoute(currentDomain);
					}
				}
				await provisionCloudflareForDomain(domain);
			} else if (currentDomain.publishToCloudflare) {
				// Publishing was turned off — deprovision and clear status fields,
				// including the resolved zone so a later re-enable can't reuse a stale
				// zone against a different integration.
				await deprovisionCloudflareForDomain(currentDomain);
				await updateDomainById(domain.domainId, {
					cloudflareIngressApplied: false,
					cloudflareDnsRecordId: null,
					cloudflareTunnelId: null,
					cloudflareZoneId: null,
				});
			}
			return result;
		}),
	one: protectedProcedure.input(apiFindDomain).query(async ({ input, ctx }) => {
		const domain = await findDomainById(input.domainId);
		const serviceId = domain.applicationId || domain.composeId;
		if (serviceId) {
			await checkServicePermissionAndAccess(ctx, serviceId, {
				domain: ["read"],
			});
		} else if (domain.previewDeploymentId) {
			const preview = await findPreviewDeploymentById(
				domain.previewDeploymentId,
			);
			await checkServicePermissionAndAccess(ctx, preview.applicationId, {
				domain: ["read"],
			});
		}
		return domain;
	}),
	delete: protectedProcedure
		.input(apiFindDomain)
		.mutation(async ({ input, ctx }) => {
			const domain = await findDomainById(input.domainId);
			const serviceId = domain.applicationId || domain.composeId;
			if (serviceId) {
				await checkServicePermissionAndAccess(ctx, serviceId, {
					domain: ["delete"],
				});
			} else if (domain.previewDeploymentId) {
				const preview = await findPreviewDeploymentById(
					domain.previewDeploymentId,
				);
				await checkServicePermissionAndAccess(ctx, preview.applicationId, {
					domain: ["delete"],
				});
			}

			// Remove external Cloudflare state BEFORE the row is deleted so the
			// stored tunnel/zone/record IDs are still available.
			await deprovisionCloudflareForDomain(domain);

			const result = await removeDomainById(input.domainId);
			await audit(ctx, {
				action: "delete",
				resourceType: "domain",
				resourceId: domain.domainId,
				resourceName: domain.host,
			});

			if (domain.applicationId) {
				const application = await findApplicationById(domain.applicationId);
				await removeDomain(application, domain.uniqueConfigKey);
			}

			return result;
		}),

	validateDomain: withPermission("domain", "read")
		.input(
			z.object({
				domain: z.string(),
				serverIp: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			return validateDomain(input.domain, input.serverIp);
		}),
});
