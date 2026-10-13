import {
	assertApplicationDomainAccess,
	deployForwardAuthOnServer,
	disableForwardAuthOnDomain,
	enableForwardAuthOnDomain,
	findServerById,
	forwardAuthCallbackUrl,
	getDomainSsoStatus,
	getForwardAuthServerStatus,
	getForwardAuthSettings,
	listSsoProvidersForOrg,
	removeForwardAuthProxy,
	removeForwardAuthSettings,
	setForwardAuthSettings,
} from "@dokploy/server";
import {
	apiDeployForwardAuthOnServer,
	apiForwardAuthDomainTarget,
	apiForwardAuthServerTarget,
	apiSetForwardAuthSettings,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	createTRPCRouter,
	enterpriseProcedure,
	withPermission,
} from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";

export const forwardAuthRouter = createTRPCRouter({
	getAuthDomain: enterpriseProcedure
		.input(apiForwardAuthServerTarget)
		.query(async ({ ctx, input }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}
			const settings = await getForwardAuthSettings(input.serverId);
			if (!settings) return null;
			return {
				host: settings.authDomain,
				https: settings.https,
				certificateType: settings.certificateType,
				customCertResolver: settings.customCertResolver,
				callbackUrl: forwardAuthCallbackUrl(
					settings.authDomain,
					settings.https,
				),
			};
		}),

	setAuthDomain: enterpriseProcedure
		.input(apiSetForwardAuthSettings)
		.mutation(async ({ ctx, input }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}
			const result = await setForwardAuthSettings({
				organizationId: ctx.session.activeOrganizationId,
				serverId: input.serverId,
				authDomain: input.authDomain,
				https: input.https,
				certificateType: input.certificateType,
				customCertResolver: input.customCertResolver,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: "forward-auth-domain",
			});
			return result;
		}),

	removeAuthDomain: enterpriseProcedure
		.input(apiForwardAuthServerTarget)
		.mutation(async ({ ctx, input }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}
			const result = await removeForwardAuthSettings(input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: "forward-auth-domain",
			});
			return result;
		}),

	listProviders: enterpriseProcedure.query(({ ctx }) =>
		listSsoProvidersForOrg(ctx.session.activeOrganizationId),
	),

	serverStatus: enterpriseProcedure.query(({ ctx }) =>
		getForwardAuthServerStatus(ctx.session.activeOrganizationId),
	),

	deployOnServer: enterpriseProcedure
		.input(apiDeployForwardAuthOnServer)
		.mutation(async ({ ctx, input }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}
			const result = await deployForwardAuthOnServer({
				serverId: input.serverId ?? undefined,
				providerId: input.providerId,
				organizationId: ctx.session.activeOrganizationId,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: "forward-auth",
			});
			return result;
		}),

	removeOnServer: enterpriseProcedure
		.input(apiForwardAuthServerTarget)
		.mutation(async ({ ctx, input }) => {
			if (input.serverId) {
				const server = await findServerById(input.serverId);
				if (server.organizationId !== ctx.session?.activeOrganizationId) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}
			const result = await removeForwardAuthProxy(input.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "server",
				resourceId: input.serverId ?? "local",
				resourceName: "forward-auth",
			});
			return result;
		}),

	status: withPermission("domain", "read")
		.input(apiForwardAuthDomainTarget)
		.query(({ ctx, input }) => getDomainSsoStatus(ctx, input.domainId)),

	enable: withPermission("domain", "create")
		.input(apiForwardAuthDomainTarget)
		.mutation(async ({ ctx, input }) => {
			const domain = await assertApplicationDomainAccess(
				ctx,
				input.domainId,
				"create",
			);
			const result = await enableForwardAuthOnDomain({
				domainId: input.domainId,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "domain",
				resourceId: domain.domainId,
				resourceName: domain.host,
			});
			return result;
		}),

	disable: withPermission("domain", "create")
		.input(apiForwardAuthDomainTarget)
		.mutation(async ({ ctx, input }) => {
			const domain = await assertApplicationDomainAccess(
				ctx,
				input.domainId,
				"create",
			);
			const result = await disableForwardAuthOnDomain({
				domainId: input.domainId,
			});
			await audit(ctx, {
				action: "update",
				resourceType: "domain",
				resourceId: domain.domainId,
				resourceName: domain.host,
			});
			return result;
		}),
});
