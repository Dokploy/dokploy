import {
	createDomain,
	findApplicationById,
	findDomainById,
	findDomainsByApplicationId,
	findDomainsByComposeId,
	findPreviewDeploymentById,
	findServerById,
	generateTraefikMeDomain,
	getWebServerSettings,
	manageDomain,
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

export const domainRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDomain)
		.mutation(async ({ input, ctx }) => {
			try {
				if (input.domainType === "compose" && input.composeId) {
					await checkServicePermissionAndAccess(ctx, input.composeId, {
						domain: ["create"],
					});
				} else if (input.domainType === "application" && input.applicationId) {
					await checkServicePermissionAndAccess(ctx, input.applicationId, {
						domain: ["create"],
					});
				}
				const domain = await createDomain(input);
				await audit(ctx, {
					action: "create",
					resourceType: "domain",
					resourceId: domain.domainId,
					resourceName: domain.host,
				});
				if (domain.cloudflareZoneId) {
					const { syncDomain, LOCAL_TUNNEL_NOT_CONFIGURED } = await import(
						"@dokploy/server/services/cloudflare/orchestrator"
					);
					try {
						await syncDomain(domain.domainId);
					} catch (cfErr) {
						const message =
							cfErr instanceof Error ? cfErr.message : String(cfErr);
						// Local-tunnel-missing is a real failure the user must act on.
						// Other CF errors are non-fatal — domain still exists in error state.
						if (message === LOCAL_TUNNEL_NOT_CONFIGURED) {
							throw new TRPCError({
								code: "PRECONDITION_FAILED",
								message:
									"Local Cloudflare tunnel is not configured. Set one up in Settings → Cloudflare → Local Tunnel before adding Cloudflare-managed domains for panel-host services.",
								cause: cfErr,
							});
						}
						console.warn("Cloudflare sync failed:", cfErr);
					}
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

			const oldZoneId = currentDomain.cloudflareZoneId;
			const newZoneId =
				"cloudflareZoneId" in input
					? (input.cloudflareZoneId ?? null)
					: oldZoneId;
			const zoneChanged = oldZoneId !== newZoneId;
			const hostChanged =
				typeof input.host === "string" && input.host !== currentDomain.host;

			let result: Awaited<ReturnType<typeof updateDomainById>>;
			let didSync = false;
			let cloudflarePending = false;

			if (zoneChanged) {
				if (oldZoneId) {
					try {
						const { unsyncDomain } = await import(
							"@dokploy/server/services/cloudflare/orchestrator"
						);
						await unsyncDomain(input.domainId);
					} catch (cfErr) {
						console.warn("Cloudflare unsync failed:", cfErr);
					}
				}
				result = await updateDomainById(input.domainId, {
					...input,
					cloudflareRecordId: null,
					cloudflareSyncStatus: newZoneId ? "pending" : null,
					cloudflareSyncError: null,
					cloudflareSyncedAt: null,
				});
				if (newZoneId) {
					try {
						const { syncDomain } = await import(
							"@dokploy/server/services/cloudflare/orchestrator"
						);
						await syncDomain(input.domainId);
						didSync = true;
					} catch (cfErr) {
						console.warn("Cloudflare sync failed:", cfErr);
					}
				}
			} else if (hostChanged && oldZoneId) {
				try {
					const { renameDomainHost } = await import(
						"@dokploy/server/services/cloudflare/orchestrator"
					);
					await renameDomainHost(input.domainId, input.host as string);
				} catch (cfErr) {
					console.warn("Cloudflare rename failed:", cfErr);
					cloudflarePending = true;
				}
				result = await updateDomainById(input.domainId, {
					...input,
					...(cloudflarePending
						? {
								cloudflareSyncStatus: "pending" as const,
								cloudflareSyncError: null,
							}
						: {}),
				});
			} else {
				result = await updateDomainById(input.domainId, input);
			}

			const domain = await findDomainById(input.domainId);
			if (
				!didSync &&
				domain.cloudflareZoneId &&
				domain.cloudflareSyncStatus !== "synced"
			) {
				try {
					const { syncDomain } = await import(
						"@dokploy/server/services/cloudflare/orchestrator"
					);
					await syncDomain(domain.domainId);
					didSync = true;
				} catch (cfErr) {
					console.warn("Cloudflare sync failed:", cfErr);
				}
			}
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

			if (domain.cloudflareZoneId) {
				try {
					const { unsyncDomain } = await import(
						"@dokploy/server/services/cloudflare/orchestrator"
					);
					await unsyncDomain(domain.domainId);
				} catch (cfErr) {
					console.warn("Cloudflare unsync failed:", cfErr);
				}
			}
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
