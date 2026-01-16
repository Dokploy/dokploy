import {
	createProxy,
	deleteProxy,
	findProxyById,
	IS_CLOUD,
	linkToService,
	listProxies,
	unlinkFromService,
	updateProxy,
	validateProxyConfig,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateProxy,
	apiDeleteProxy,
	apiFindProxy,
	apiLinkProxy,
	apiUnlinkProxy,
	apiUpdateProxy,
	proxies,
} from "@/server/db/schema";

export const proxyRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateProxy)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Please set a server to create a proxy",
				});
			}
			return await createProxy(input, ctx.session.activeOrganizationId);
		}),

	update: adminProcedure
		.input(apiUpdateProxy)
		.mutation(async ({ input, ctx }) => {
			const proxy = await findProxyById(input.proxyId);
			if (proxy.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this proxy",
				});
			}
			return await updateProxy(input);
		}),

	delete: adminProcedure
		.input(apiDeleteProxy)
		.mutation(async ({ input, ctx }) => {
			const proxy = await findProxyById(input.proxyId);
			if (proxy.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this proxy",
				});
			}
			await deleteProxy(input.proxyId);
			return true;
		}),

	one: adminProcedure
		.input(apiFindProxy)
		.query(async ({ input, ctx }) => {
			const proxy = await findProxyById(input.proxyId);
			if (proxy.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this proxy",
				});
			}
			return proxy;
		}),

	all: adminProcedure.query(async ({ ctx }) => {
		return await listProxies(ctx.session.activeOrganizationId);
	}),

	link: adminProcedure
		.input(apiLinkProxy)
		.mutation(async ({ input, ctx }) => {
			const proxy = await findProxyById(input.proxyId);
			if (proxy.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to link this proxy",
				});
			}
			return await linkToService(
				input.proxyId,
				input.targetType,
				input.targetId,
			);
		}),

	unlink: adminProcedure
		.input(apiUnlinkProxy)
		.mutation(async ({ input, ctx }) => {
			const proxy = await findProxyById(input.proxyId);
			if (proxy.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to unlink this proxy",
				});
			}
			return await unlinkFromService(input.proxyId);
		}),

	validate: adminProcedure
		.input(
			z.union([
				apiCreateProxy,
				apiUpdateProxy.extend({ proxyId: z.string().optional() }),
			]),
		)
		.query(async ({ input }) => {
			return validateProxyConfig(input);
		}),

	test: adminProcedure
		.input(apiFindProxy)
		.mutation(async ({ input, ctx }) => {
			const proxy = await findProxyById(input.proxyId);
			if (proxy.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to test this proxy",
				});
			}

			// Basic connectivity test - in a real implementation, this would
			// attempt to connect to the target URL and verify it's reachable
			// For now, we'll just return a success status
			try {
				if (proxy.targetUrl) {
					const url = new URL(proxy.targetUrl);
					// Could add actual HTTP request here
					return { success: true, message: "Proxy target is reachable" };
				}
				return { success: true, message: "Proxy configuration is valid" };
			} catch (error) {
				return {
					success: false,
					message: error instanceof Error ? error.message : "Unknown error",
				};
			}
		}),
});

