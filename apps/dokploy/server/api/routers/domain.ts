import {
	type Cloudflare,
	createDomain,
	type Domain,
	deprovisionCloudflareForDomain,
	findAccessApplicationByDomainId,
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
	provisionCloudflareAccessForDomain,
	provisionCloudflareForDomain,
	removeCloudflareRoute,
	removeDomain,
	removeDomainById,
	resolveOrgCloudflarePolicy,
	resolveZoneIdForHost,
	selectIntegrationForHost,
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

/**
 * Gates an already-published domain with Cloudflare Access using its
 * integration's default identities (passing empty arrays lets the Access service
 * fall back to them). Returns whether Access was enabled — it is skipped (false)
 * when there are no default identities, since an Access app with no allow rules
 * would lock everyone out.
 */
const autoEnableAccessWithDefaults = async (
	domain: Domain,
): Promise<boolean> => {
	if (!domain.cloudflareId) {
		return false;
	}
	const integration = await findCloudflareById(domain.cloudflareId);
	const hasDefaults =
		integration.defaultAllowEmails.length > 0 ||
		integration.defaultAllowEmailDomains.length > 0;
	if (!hasDefaults) {
		return false;
	}
	const published = await findDomainById(domain.domainId);
	await provisionCloudflareAccessForDomain(published, {
		sessionDuration: integration.defaultSessionDuration,
		allowEmails: [],
		allowEmailDomains: [],
	});
	return true;
};

/**
 * Auto-protects a freshly created domain through the given integration (the one
 * that owns the host's zone): publishes it via Tunnel and gates it with
 * Cloudflare Access using that integration's default identities. System-initiated
 * — the admin pre-authorized it by enabling the policy — so it provisions on a
 * member's behalf without the member being a Cloudflare admin.
 *
 * When `mustProtect` (a member under that integration's "require protected"
 * policy) and Access can't be enabled (no default identities), it throws so the
 * caller rolls back — never leaving the domain published-but-public.
 */
const autoProtectDomain = async (
	domain: Domain,
	integration: Cloudflare,
	mustProtect: boolean,
): Promise<void> => {
	// Publish via Tunnel using the integration's default tunnel (shared-managed
	// when none is set).
	await updateDomainById(domain.domainId, {
		publishToCloudflare: true,
		cloudflareId: integration.cloudflareId,
		cloudflareTunnelMode: integration.defaultTunnelId
			? "existing-instance"
			: "shared-managed",
		cloudflareTunnelId: integration.defaultTunnelId ?? null,
	});
	const published = await findDomainById(domain.domainId);
	await provisionCloudflareForDomain(published);
	const accessEnabled = await autoEnableAccessWithDefaults(published);
	if (mustProtect && !accessEnabled) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message:
				"Your organization requires every domain to be protected with Cloudflare Access, but no default Access identities are configured. Ask an admin to set them.",
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

				const isAdmin = ctx.user.role === "owner" || ctx.user.role === "admin";

				// Explicit, user-chosen publishing keeps its owner/admin gate.
				if (input.publishToCloudflare) {
					requireCloudflareAdmin(ctx);
					if (input.cloudflareId) {
						await assertCloudflareIntegrationInOrg(
							input.cloudflareId,
							ctx.session.activeOrganizationId,
						);
					}
				}

				// Org Cloudflare protection policy (protect-by-default / require-
				// protected) is enforced here, on the interactive domain create path.
				// Bulk/system domain creation (preview deployments, project/compose
				// import, AI scaffolding) deliberately bypasses auto-protect: those
				// hosts are typically generated/non-Cloudflare and ephemeral, so there is
				// no zone to protect them through.
				const policy = await resolveOrgCloudflarePolicy(
					ctx.session.activeOrganizationId,
				);

				const domain = await createDomain(input);

				// Tear down anything provisioned for this domain (Access + route +
				// tunnel — deprovision needs the persisted ids, so refetch first), then
				// the row and the Traefik router createDomain wrote, so a failed publish
				// never leaks an orphaned router that accumulates on retries.
				const rollback = async () => {
					const current = await findDomainById(domain.domainId).catch(
						() => domain,
					);
					await deprovisionCloudflareForDomain(current).catch(() => {});
					await removeDomainById(domain.domainId);
					if (domain.applicationId) {
						const application = await findApplicationById(domain.applicationId);
						await removeDomain(application, domain.uniqueConfigKey).catch(
							() => {},
						);
					}
				};

				try {
					if (isCloudflarePublished(domain)) {
						// Admin explicitly published. Provision the tunnel; when the
						// chosen integration protects by default also gate it with Access
						// using its defaults, so an explicitly-published domain is protected
						// too.
						await provisionCloudflareForDomain(domain);
						const chosen = domain.cloudflareId
							? await findCloudflareById(domain.cloudflareId)
							: null;
						if (chosen?.protectDomainsByDefault) {
							await autoEnableAccessWithDefaults(domain);
						}
					} else if (
						policy &&
						(policy.protectDomainsByDefault || policy.requireProtectedDomains)
					) {
						// An org protection policy is active. The integration that owns the
						// host's zone is authoritative for whether this domain must/should be
						// protected (so a per-integration policy is applied consistently with
						// the defaults it provides). selectIntegrationForHost returns null
						// only when no token owns the zone; a Cloudflare API failure rethrows,
						// so a transient outage fails the create closed (and rolls back)
						// rather than silently creating an unprotected domain under policy.
						const integration = await selectIntegrationForHost(
							policy.integrations,
							domain.host,
						);
						if (integration) {
							// Members are forced when that integration requires protection;
							// owners/admins may still create an unprotected domain (override).
							const mustProtect =
								integration.requireProtectedDomains && !isAdmin;
							if (integration.protectDomainsByDefault || mustProtect) {
								// autoProtectDomain throws when it must protect but can't, so a
								// member can never end up with a published-but-public domain.
								await autoProtectDomain(domain, integration, mustProtect);
							}
						} else if (policy.requireProtectedDomains && !isAdmin) {
							// Require-protected is on for this member but no connected account
							// manages the host's zone, so it can't be protected. Refuse rather
							// than silently creating an unprotected, publicly-reachable domain.
							throw new TRPCError({
								code: "FORBIDDEN",
								message:
									"Your organization requires every domain to be protected with Cloudflare, but no connected Cloudflare account manages this hostname's zone. Add the zone to Cloudflare or ask an admin.",
							});
						}
						// Otherwise no integration owns the host's zone and protection isn't
						// required → it can't be Cloudflare protected, so it stays a plain
						// domain.
					}
				} catch (error) {
					await rollback();
					throw error;
				}

				await audit(ctx, {
					action: "create",
					resourceType: "domain",
					resourceId: domain.domainId,
					resourceName: domain.host,
				});
				return domain;
			} catch (error) {
				// Preserve deliberate TRPCErrors (FORBIDDEN/UNAUTHORIZED) instead of
				// flattening every failure to BAD_REQUEST.
				if (error instanceof TRPCError) {
					throw error;
				}
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

			// If this update keeps the domain Cloudflare-published AND moves it to a
			// new host or integration, validate the new target's zone BEFORE mutating
			// the row or the Traefik router. A bad target (host not in the chosen
			// account's zones) then fails the update with the domain and its existing
			// route untouched, instead of half-applying the move and tearing down the
			// old route before discovering the new one can't be provisioned.
			// Use `!== undefined` (not `??`) so an explicit `cloudflareId: null`
			// (clearing the integration) is honored as null rather than falling back to
			// the stored id — otherwise unpublishing could spuriously run, or be blocked
			// by, the pre-flight below.
			const nextCloudflareId =
				input.cloudflareId !== undefined
					? input.cloudflareId
					: currentDomain.cloudflareId;
			const willPublishAfter =
				(input.publishToCloudflare ?? currentDomain.publishToCloudflare) &&
				!!nextCloudflareId;
			const targetMoved =
				(input.host !== undefined &&
					input.host.trim().toLowerCase() !== currentDomain.host) ||
				(input.cloudflareId !== undefined &&
					input.cloudflareId !== currentDomain.cloudflareId);
			if (willPublishAfter && nextCloudflareId && targetMoved) {
				const newIntegration = await findCloudflareById(nextCloudflareId);
				await resolveZoneIdForHost(
					newIntegration.apiToken,
					(input.host ?? currentDomain.host).trim(),
				);
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
					// The new target's zone was already validated up front (before any
					// mutation), so tearing down the old route here is safe.
					const tunnelIdentityChanged =
						currentDomain.cloudflareId !== domain.cloudflareId ||
						currentDomain.cloudflareTunnelId !== domain.cloudflareTunnelId ||
						currentDomain.cloudflareTunnelMode !== domain.cloudflareTunnelMode;
					// Snapshot any Access config BEFORE teardown: a tunnel-identity change
					// fully deprovisions the domain (deleting the Access application row),
					// so Access is re-provisioned from this snapshot afterward rather than
					// relying on the row surviving.
					const accessApp = await findAccessApplicationByDomainId(
						currentDomain.domainId,
					);
					if (tunnelIdentityChanged) {
						// Different tunnel/integration: the old shared connector + tunnel may
						// be orphaned, so fully deprovision (route + tunnel teardown).
						await deprovisionCloudflareForDomain(currentDomain);
					} else {
						// Same tunnel, only host/zone moved: drop the old route only so a
						// shared tunnel still used by siblings stays up.
						await removeCloudflareRoute(currentDomain);
					}
					await provisionCloudflareForDomain(domain);
					// Re-point Access so a protected domain stays protected after its
					// host/zone/tunnel/integration changes: creates a fresh Access app when
					// the row was torn down above, or updates the surviving one.
					if (accessApp) {
						await provisionCloudflareAccessForDomain(domain, {
							sessionDuration: accessApp.sessionDuration,
							allowEmails: accessApp.allowEmails,
							allowEmailDomains: accessApp.allowEmailDomains,
						});
					}
				} else {
					await provisionCloudflareForDomain(domain);
				}
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

			// Tearing down a published domain removes org-scoped Cloudflare state
			// (DNS, Access app, possibly the shared connector), so require the same
			// owner/admin gate that publishing does before deprovisioning.
			if (domain.publishToCloudflare) {
				requireCloudflareAdmin(ctx);
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
