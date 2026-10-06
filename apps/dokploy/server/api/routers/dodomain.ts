import {
	checkDoDomainHost,
	createDoDomain,
	createDoDomainConnectSession,
	type DoDomainIntegration,
	findDoDomainByOrganizationId,
	findDomainById,
	findPreviewDeploymentById,
	getDoDomainConnectionStatus,
	getDoDomainWebhookReachability,
	IS_CLOUD,
	maskDoDomainSecretKey,
	removeDoDomain,
	reverifyDoDomainDomain,
	testDoDomainConnection,
	updateDoDomain,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import {
	adminProcedure,
	createTRPCRouter,
	protectedProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateDoDomain,
	apiDoDomainCheckHost,
	apiDoDomainDomain,
	apiTestDoDomainConnection,
	apiUpdateDoDomain,
} from "@/server/db/schema";

/**
 * DoDomain is a self-hosted-only integration (the Settings → Integrations
 * page is hidden on cloud); refuse it server-side too.
 */
const assertSelfHosted = () => {
	if (IS_CLOUD) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Functionality not available in cloud version",
		});
	}
};

/**
 * Client-safe view of the integration: the secret key and the webhook
 * signing secret are never sent to the browser.
 */
const presentIntegration = (integration: DoDomainIntegration) => {
	const { secretKey, webhookSecret, ...rest } = integration;
	return {
		...rest,
		secretKeyMasked: maskDoDomainSecretKey(secretKey),
		webhookRegistered: !!(integration.webhookEndpointId && webhookSecret),
	};
};

const requireIntegration = async (organizationId: string) => {
	const integration = await findDoDomainByOrganizationId(organizationId);
	if (!integration) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message:
				"DoDomain is not connected. An admin can connect it in Settings → Integrations.",
		});
	}
	return integration;
};

const asBadRequest = (error: unknown, fallback: string): never => {
	if (error instanceof TRPCError) throw error;
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: error instanceof Error ? error.message : fallback,
		cause: error,
	});
};

type DomainAction = "read" | "create";

/**
 * Proves the caller may act on a domain id: the domain's service must belong
 * to the caller's organization and the caller must hold the domain permission
 * on it (`checkServicePermissionAndAccess` → `assertServiceInOrganization`).
 * Runs before the org's DoDomain credentials are loaded or DoDomain is called.
 */
const authorizeDomain = async (
	ctx: Parameters<typeof checkServicePermissionAndAccess>[0],
	domainId: string,
	action: DomainAction,
) => {
	const domain = await findDomainById(domainId);
	let serviceId = domain.applicationId || domain.composeId;
	if (!serviceId && domain.previewDeploymentId) {
		const preview = await findPreviewDeploymentById(domain.previewDeploymentId);
		serviceId = preview.composeId ?? preview.applicationId;
	}
	if (!serviceId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this domain",
		});
	}
	await checkServicePermissionAndAccess(ctx, serviceId, {
		domain: [action],
	});
	return domain;
};

/**
 * DoDomain integration (org-scoped).
 *
 * Credential procedures (one/create/update/remove/testConnection) are
 * `adminProcedure`: they read or store the org-wide secret key. Per-domain
 * procedures take a domainId and authorize it through the domain's service
 * first; the service layer re-checks the domain's organization against the
 * integration before any DoDomain call.
 */
export const dodomainRouter = createTRPCRouter({
	one: adminProcedure.query(async ({ ctx }) => {
		assertSelfHosted();
		const integration = await findDoDomainByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		if (!integration) return null;
		return {
			...presentIntegration(integration),
			// Whether DoDomain can reach this panel's webhook URL (host-based).
			webhookReachability: await getDoDomainWebhookReachability(),
		};
	}),

	/** Lets the domain dialog show DoDomain actions to non-admin members. */
	configured: protectedProcedure.query(async ({ ctx }) => {
		if (IS_CLOUD) return { configured: false };
		const integration = await findDoDomainByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		return { configured: !!integration };
	}),

	create: adminProcedure
		.input(apiCreateDoDomain)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const { integration: created, webhookWarning } = await createDoDomain(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "dodomain",
				resourceId: created.dodomainId,
				resourceName: created.name,
			});
			// A refused webhook URL still saves the integration; the warning says why
			// no webhooks will arrive.
			return { ...presentIntegration(created), webhookWarning };
		}),

	update: adminProcedure
		.input(apiUpdateDoDomain)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const { integration: updated, webhookWarning } = await updateDoDomain(
				ctx.session.activeOrganizationId,
				input,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "dodomain",
				resourceId: updated.dodomainId,
				resourceName: updated.name,
			});
			return { ...presentIntegration(updated), webhookWarning };
		}),

	remove: adminProcedure.mutation(async ({ ctx }) => {
		assertSelfHosted();
		const removed = await removeDoDomain(ctx.session.activeOrganizationId);
		if (removed) {
			await audit(ctx, {
				action: "delete",
				resourceType: "dodomain",
				resourceId: removed.dodomainId,
				resourceName: removed.name,
			});
		}
		return true;
	}),

	testConnection: adminProcedure
		.input(apiTestDoDomainConnection)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			// Edit flow: the key field is blank (write-only), so test with the
			// stored key of the caller's own integration.
			let secretKey = input.secretKey;
			let appId = input.appId;
			if (!secretKey) {
				const integration = await findDoDomainByOrganizationId(
					ctx.session.activeOrganizationId,
				);
				secretKey = integration?.secretKey;
				appId = appId ?? integration?.appId;
			}
			if (!secretKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "A secret key is required to test the connection",
				});
			}
			try {
				return await testDoDomainConnection({
					secretKey,
					baseUrl: input.baseUrl,
					appId,
				});
			} catch (error) {
				return asBadRequest(error, "Error connecting to DoDomain");
			}
		}),

	/** DoDomain's provider/zone/method detection for a hostname. */
	checkDomain: withPermission("domain", "read")
		.input(apiDoDomainCheckHost)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const integration = await requireIntegration(
				ctx.session.activeOrganizationId,
			);
			try {
				return await checkDoDomainHost(integration, input.host);
			} catch (error) {
				return asBadRequest(error, "Error checking the domain with DoDomain");
			}
		}),

	createConnectSession: protectedProcedure
		.input(apiDoDomainDomain)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const domain = await authorizeDomain(ctx, input.domainId, "create");
			const integration = await requireIntegration(
				ctx.session.activeOrganizationId,
			);
			const session = await createDoDomainConnectSession({
				integration,
				domainId: domain.domainId,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "dodomain",
				resourceId: domain.domainId,
				resourceName: domain.host,
				metadata: { sessionId: session.sessionId },
			});
			return session;
		}),

	reverify: protectedProcedure
		.input(apiDoDomainDomain)
		.mutation(async ({ input, ctx }) => {
			assertSelfHosted();
			const domain = await authorizeDomain(ctx, input.domainId, "create");
			const integration = await requireIntegration(
				ctx.session.activeOrganizationId,
			);
			return reverifyDoDomainDomain({
				integration,
				domainId: domain.domainId,
			});
		}),

	connectionStatus: protectedProcedure
		.input(apiDoDomainDomain)
		.query(async ({ input, ctx }) => {
			assertSelfHosted();
			const domain = await authorizeDomain(ctx, input.domainId, "read");
			const integration = await findDoDomainByOrganizationId(
				ctx.session.activeOrganizationId,
			);
			if (!domain.applicationId && !domain.composeId) {
				return null;
			}
			return getDoDomainConnectionStatus({
				integration,
				domainId: domain.domainId,
			});
		}),
});
