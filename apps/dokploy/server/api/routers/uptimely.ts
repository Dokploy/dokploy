import {
	createUptimely,
	findUptimelyByOrganizationId,
	getUptimelyServiceStatus,
	hasUptimelyMonitorableTarget,
	IS_CLOUD,
	linkUptimelyService,
	listUptimelyStatusPages,
	maskUptimelyApiKey,
	preflightUptimelyTarget,
	removeUptimely,
	resolveUptimelyServiceTarget,
	runUptimelyProbe,
	testUptimelyConnection,
	type UptimelyIntegration,
	uptimelyBadgeUrl,
	unlinkUptimelyService,
	updateUptimely,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateUptimely,
	apiLinkUptimelyService,
	apiPreflightUptimelyService,
	apiRunUptimelyProbe,
	apiTestUptimelyConnection,
	apiUpdateUptimely,
	apiUptimelyService,
} from "@/server/db/schema";

/**
 * The Uptimely integration is a self-hosted-only feature (the Settings →
 * Integrations page is hidden on cloud); refuse it server-side too.
 */
const assertSelfHosted = () => {
	if (IS_CLOUD) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Functionality not available in cloud version",
		});
	}
};

/** Client-safe view of the integration: the API key is masked, never sent. */
const presentIntegration = (integration: UptimelyIntegration) => {
	const { apiKey, ...rest } = integration;
	return { ...rest, apiKeyMasked: maskUptimelyApiKey(apiKey) };
};

const requireIntegration = async (organizationId: string) => {
	const integration = await findUptimelyByOrganizationId(organizationId);
	if (!integration) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message:
				"Uptimely is not connected. An admin can connect it in Settings → Integrations.",
		});
	}
	return integration;
};

/** Converts a thrown client/service error into a tRPC BAD_REQUEST. */
const asBadRequest = (error: unknown, fallback: string): never => {
	if (error instanceof TRPCError) throw error;
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: error instanceof Error ? error.message : fallback,
		cause: error,
	});
};

/**
 * Uptimely integration (org-scoped).
 *
 * Credential procedures (one/create/update/remove/testConnection/statusPages)
 * are `adminProcedure`: they read or store the org-wide project API key.
 * Per-service procedures take a serviceId, so each one first proves the
 * service belongs to the caller's organization and that the caller may access
 * it (`checkServicePermissionAndAccess` → `assertServiceInOrganization`), then
 * re-checks the loaded row's organization before any Uptimely call.
 */
export const uptimelyRouter = createTRPCRouter({
	one: adminProcedure.query(async ({ ctx }) => {
		assertSelfHosted();
		const integration = await findUptimelyByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		return integration ? presentIntegration(integration) : null;
	}),

	create: adminProcedure
		.input(apiCreateUptimely)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const created = await createUptimely(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "uptimely",
				resourceId: created.uptimelyId,
				resourceName: created.name,
			});
			return presentIntegration(created);
		}),

	update: adminProcedure
		.input(apiUpdateUptimely)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const updated = await updateUptimely(
				ctx.session.activeOrganizationId,
				input,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "uptimely",
				resourceId: updated.uptimelyId,
				resourceName: updated.name,
			});
			return presentIntegration(updated);
		}),

	remove: adminProcedure.mutation(async ({ ctx }) => {
		assertSelfHosted();
		const removed = await removeUptimely(ctx.session.activeOrganizationId);
		if (removed) {
			await audit(ctx, {
				action: "delete",
				resourceType: "uptimely",
				resourceId: removed.uptimelyId,
				resourceName: removed.name,
			});
		}
		return true;
	}),

	testConnection: adminProcedure
		.input(apiTestUptimelyConnection)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			// Edit flow: the key field is blank (write-only), so test with the
			// stored key of the caller's own integration.
			let apiKey = input.apiKey;
			if (!apiKey) {
				const integration = await findUptimelyByOrganizationId(
					ctx.session.activeOrganizationId,
				);
				apiKey = integration?.apiKey;
			}
			if (!apiKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "An API key is required to test the connection",
				});
			}
			try {
				return await testUptimelyConnection({
					apiKey,
					baseUrl: input.baseUrl,
					projectId: input.projectId,
				});
			} catch (error) {
				return asBadRequest(error, "Error connecting to Uptimely");
			}
		}),

	statusPages: adminProcedure.query(async ({ ctx }) => {
		assertSelfHosted();
		const integration = await requireIntegration(
			ctx.session.activeOrganizationId,
		);
		try {
			return await listUptimelyStatusPages(integration);
		} catch (error) {
			return asBadRequest(error, "Error listing Uptimely status pages");
		}
	}),

	serviceStatus: protectedProcedure
		.input(apiUptimelyService)
		.query(async ({ input, ctx }) => {
			assertSelfHosted();
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				monitoring: ["read"],
			});
			const integration = await findUptimelyByOrganizationId(
				ctx.session.activeOrganizationId,
			);
			if (!integration) {
				return { configured: false as const };
			}
			const status = await getUptimelyServiceStatus({
				integration,
				serviceType: input.serviceType,
				serviceId: input.serviceId,
			});
			// Only needed before the first monitor exists: lets the panel say up
			// front that there is nothing to monitor. null = could not tell, so
			// the panel keeps the button enabled and the server stays the judge.
			let monitorable: boolean | null = null;
			if (status.monitors.length === 0) {
				try {
					const target = await resolveUptimelyServiceTarget(
						input.serviceType,
						input.serviceId,
					);
					monitorable =
						target.organizationId === ctx.session.activeOrganizationId
							? hasUptimelyMonitorableTarget(target)
							: null;
				} catch {
					monitorable = null;
				}
			}
			return {
				configured: true as const,
				monitorable,
				baseUrl: integration.baseUrl,
				projectId: integration.projectId,
				badgeUrl: uptimelyBadgeUrl(integration),
				statusPageUrl: integration.statusPageSlug
					? `${integration.baseUrl}/status/${encodeURIComponent(integration.statusPageSlug)}`
					: null,
				...status,
			};
		}),

	linkService: protectedProcedure
		.input(apiLinkUptimelyService)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			// Creating monitors is a service-management action (same gate as the
			// service's Advanced tab), on top of the org + service access check.
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				service: ["create"],
			});
			const integration = await requireIntegration(
				ctx.session.activeOrganizationId,
			);
			const target = await resolveUptimelyServiceTarget(
				input.serviceType,
				input.serviceId,
				{ checkPath: input.checkPath },
			);
			if (target.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this service",
				});
			}
			try {
				const result = await linkUptimelyService({
					integration,
					serviceType: input.serviceType,
					serviceId: input.serviceId,
					includeSslAndDomain: input.includeSslAndDomain,
					target,
				});
				await audit(ctx, {
					action: "create",
					resourceType: "uptimely",
					resourceId: input.serviceId,
					resourceName: `${target.projectName}/${target.serviceName}`,
					metadata: {
						serviceType: input.serviceType,
						monitorsCreated: result.created.length,
					},
				});
				return {
					created: result.created.length,
					skipped: result.skipped,
				};
			} catch (error) {
				return asBadRequest(error, "Error creating Uptimely monitors");
			}
		}),

	/**
	 * Real GET of each HTTPS URL a Website monitor would watch, so the panel
	 * can warn before creating monitors that Uptimely would report Offline.
	 * Same gate as `linkService`; the URLs are derived server-side from the
	 * service's own domains (+ the validated `checkPath`), never taken from the
	 * client, and every hop must be public HTTPS. A mutation (not a query) on
	 * purpose: it makes outbound requests, so it is explicit and, for MCP, sits
	 * in the admin scope next to `linkService` rather than the read scope.
	 */
	preflightService: protectedProcedure
		.input(apiPreflightUptimelyService)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				service: ["create"],
			});
			await requireIntegration(ctx.session.activeOrganizationId);
			const target = await resolveUptimelyServiceTarget(
				input.serviceType,
				input.serviceId,
				{ checkPath: input.checkPath },
			);
			if (target.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this service",
				});
			}
			return preflightUptimelyTarget(target);
		}),

	unlinkService: protectedProcedure
		.input(apiUptimelyService)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				service: ["create"],
			});
			const integration = await requireIntegration(
				ctx.session.activeOrganizationId,
			);
			const removed = await unlinkUptimelyService({
				integration,
				serviceType: input.serviceType,
				serviceId: input.serviceId,
			});
			await audit(ctx, {
				action: "delete",
				resourceType: "uptimely",
				resourceId: input.serviceId,
				metadata: {
					serviceType: input.serviceType,
					linksRemoved: removed.length,
				},
			});
			return { removed: removed.length };
		}),

	runProbe: protectedProcedure
		.input(apiRunUptimelyProbe)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				monitoring: ["read"],
			});
			const integration = await requireIntegration(
				ctx.session.activeOrganizationId,
			);
			try {
				return await runUptimelyProbe({
					integration,
					serviceType: input.serviceType,
					serviceId: input.serviceId,
					linkId: input.linkId,
				});
			} catch (error) {
				return asBadRequest(error, "Error running the Uptimely probe");
			}
		}),
});
