import {
	assertCaddyDomainSupported,
	createComposeDomain,
	createDomain,
	findApplicationById,
	findComposeById,
	findDomainById,
	findDomainsByApplicationId,
	findDomainsByComposeId,
	findPreviewDeploymentById,
	findServerById,
	generateTraefikMeDomain,
	getWebServerSettings,
	manageWebServerDomain,
	refreshCaddyComposeRoutes,
	removeDomainById,
	removeWebServerDomain,
	resolveWebServerProvider,
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

const toDomainUpdateFields = (
	domain: Awaited<ReturnType<typeof findDomainById>>,
) => ({
	host: domain.host,
	https: domain.https,
	port: domain.port,
	customEntrypoint: domain.customEntrypoint,
	path: domain.path,
	serviceName: domain.serviceName,
	domainType: domain.domainType,
	customCertResolver: domain.customCertResolver,
	certificateType: domain.certificateType,
	internalPath: domain.internalPath,
	stripPath: domain.stripPath,
	middlewares: domain.middlewares,
});

export const domainRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateDomain)
		.mutation(async ({ input, ctx }) => {
			try {
				if (input.domainType === "compose" && input.composeId) {
					await checkServicePermissionAndAccess(ctx, input.composeId, {
						domain: ["create"],
					});
					const compose = await findComposeById(input.composeId);
					const provider = await resolveWebServerProvider(compose.serverId);
					const domain = await createComposeDomain(
						compose,
						input,
						provider,
						ctx.session.activeOrganizationId,
					);
					await audit(ctx, {
						action: "create",
						resourceType: "domain",
						resourceId: domain.domainId,
						resourceName: domain.host,
					});
					return domain;
				}
				if (input.domainType === "application" && input.applicationId) {
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

			const nextDomain = { ...currentDomain, ...input };
			if (currentDomain.applicationId) {
				const application = await findApplicationById(
					currentDomain.applicationId,
				);
				if (
					(await resolveWebServerProvider(application.serverId)) === "caddy"
				) {
					assertCaddyDomainSupported(nextDomain);
					await manageWebServerDomain(application, nextDomain);
					try {
						const result = await updateDomainById(input.domainId, input);
						if (!result) {
							throw new Error("Error updating domain");
						}
						await audit(ctx, {
							action: "update",
							resourceType: "domain",
							resourceId: result.domainId,
							resourceName: result.host,
						});
						return result;
					} catch (error) {
						await manageWebServerDomain(application, currentDomain);
						throw error;
					}
				}
			} else if (currentDomain.previewDeploymentId) {
				const previewDeployment = await findPreviewDeploymentById(
					currentDomain.previewDeploymentId,
				);
				const application = await findApplicationById(
					previewDeployment.applicationId,
				);
				application.appName = previewDeployment.appName;
				if (
					(await resolveWebServerProvider(application.serverId)) === "caddy"
				) {
					assertCaddyDomainSupported(nextDomain);
					await manageWebServerDomain(application, nextDomain);
					try {
						const result = await updateDomainById(input.domainId, input);
						if (!result) {
							throw new Error("Error updating domain");
						}
						await audit(ctx, {
							action: "update",
							resourceType: "domain",
							resourceId: result.domainId,
							resourceName: result.host,
						});
						return result;
					} catch (error) {
						await manageWebServerDomain(application, currentDomain);
						throw error;
					}
				}
			} else if (currentDomain.composeId) {
				const compose = await findComposeById(currentDomain.composeId);
				if ((await resolveWebServerProvider(compose.serverId)) === "caddy") {
					assertCaddyDomainSupported(nextDomain);
					const result = await updateDomainById(input.domainId, input);
					if (!result) {
						throw new Error("Error updating domain");
					}
					try {
						await refreshCaddyComposeRoutes(
							compose,
							undefined,
							"caddy",
							ctx.session.activeOrganizationId,
						);
						await audit(ctx, {
							action: "update",
							resourceType: "domain",
							resourceId: result.domainId,
							resourceName: result.host,
						});
						return result;
					} catch (error) {
						await updateDomainById(
							input.domainId,
							toDomainUpdateFields(currentDomain),
						);
						await refreshCaddyComposeRoutes(
							compose,
							undefined,
							"caddy",
							ctx.session.activeOrganizationId,
						);
						throw error;
					}
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
				await manageWebServerDomain(application, domain);
			} else if (domain.previewDeploymentId) {
				const previewDeployment = await findPreviewDeploymentById(
					domain.previewDeploymentId,
				);
				const application = await findApplicationById(
					previewDeployment.applicationId,
				);
				application.appName = previewDeployment.appName;
				await manageWebServerDomain(application, domain);
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

			if (domain.applicationId) {
				const application = await findApplicationById(domain.applicationId);
				if (
					(await resolveWebServerProvider(application.serverId)) === "caddy"
				) {
					await removeWebServerDomain(application, domain.uniqueConfigKey);
					try {
						const result = await removeDomainById(input.domainId);
						await audit(ctx, {
							action: "delete",
							resourceType: "domain",
							resourceId: domain.domainId,
							resourceName: domain.host,
						});
						return result;
					} catch (error) {
						await manageWebServerDomain(application, domain);
						throw error;
					}
				}
			} else if (domain.previewDeploymentId) {
				const previewDeployment = await findPreviewDeploymentById(
					domain.previewDeploymentId,
				);
				const application = await findApplicationById(
					previewDeployment.applicationId,
				);
				application.appName = previewDeployment.appName;
				if (
					(await resolveWebServerProvider(application.serverId)) === "caddy"
				) {
					await removeWebServerDomain(application, domain.uniqueConfigKey);
					try {
						const result = await removeDomainById(input.domainId);
						await audit(ctx, {
							action: "delete",
							resourceType: "domain",
							resourceId: domain.domainId,
							resourceName: domain.host,
						});
						return result;
					} catch (error) {
						await manageWebServerDomain(application, domain);
						throw error;
					}
				}
			} else if (domain.composeId) {
				const compose = await findComposeById(domain.composeId);
				if ((await resolveWebServerProvider(compose.serverId)) === "caddy") {
					const domains = await findDomainsByComposeId(compose.composeId);
					const remainingDomains = domains.filter(
						(item) => item.domainId !== domain.domainId,
					);
					try {
						await refreshCaddyComposeRoutes(
							compose,
							remainingDomains,
							"caddy",
							ctx.session.activeOrganizationId,
						);
						const result = await removeDomainById(input.domainId);
						await audit(ctx, {
							action: "delete",
							resourceType: "domain",
							resourceId: domain.domainId,
							resourceName: domain.host,
						});
						return result;
					} catch (error) {
						await refreshCaddyComposeRoutes(
							compose,
							undefined,
							"caddy",
							ctx.session.activeOrganizationId,
						);
						throw error;
					}
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
				await removeWebServerDomain(application, domain.uniqueConfigKey);
			} else if (domain.previewDeploymentId) {
				const previewDeployment = await findPreviewDeploymentById(
					domain.previewDeploymentId,
				);
				const application = await findApplicationById(
					previewDeployment.applicationId,
				);
				application.appName = previewDeployment.appName;
				await removeWebServerDomain(application, domain.uniqueConfigKey);
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
