import {
	banFail2banIp,
	configureFail2ban,
	disconnectSshSession,
	findServerById,
	getAccessibleServerIds,
	getExposedPorts,
	getFail2banStatus,
	getPendingUpdates,
	getServerActivity,
	getSshSecurity,
	removeAuthorizedKey,
	setFail2banEnabled,
	unbanFail2banIp,
	updateSshSettings,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { createTRPCRouter, withPermission } from "../trpc";

const serverInput = z.object({ serverId: z.string().min(1) });

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

const ipOrCidrSchema = z.union([z.ipv4(), z.ipv6(), z.cidrv4(), z.cidrv6()]);

const assertServerAccess = async (
	serverId: string,
	session: { userId: string; activeOrganizationId: string },
) => {
	const server = await findServerById(serverId);
	const accessibleIds = await getAccessibleServerIds(session);
	if (
		server.organizationId !== session.activeOrganizationId ||
		!accessibleIds.has(serverId)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
	if (!server.sshKeyId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "This server has no SSH key configured",
		});
	}
	return server;
};

const toTRPCError = (error: unknown): never => {
	if (error instanceof TRPCError) throw error;
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: error instanceof Error ? error.message : "Unknown error",
		cause: error,
	});
};

export const serverSecurityRouter = createTRPCRouter({
	fail2banStatus: withPermission("server", "read")
		.input(serverInput)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(input.serverId, ctx.session);
			return getFail2banStatus(input.serverId).catch(toTRPCError);
		}),
	configureFail2ban: withPermission("server", "create")
		.input(
			serverInput.extend({
				// -1 is fail2ban's permanent ban
				bantime: z.union([
					z.literal(-1),
					z.number().int().min(60).max(31_536_000),
				]),
				findtime: z.number().int().min(60).max(86_400),
				maxretry: z.number().int().min(1).max(100),
				ignoreip: z.array(ipOrCidrSchema).max(50),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			const { serverId, ...config } = input;
			await configureFail2ban(serverId, config).catch(toTRPCError);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: serverId,
				resourceName: server.name,
				metadata: { type: "configureFail2ban", ...config },
			});
			return true;
		}),
	setFail2banEnabled: withPermission("server", "create")
		.input(serverInput.extend({ enabled: z.boolean() }))
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			await setFail2banEnabled(input.serverId, input.enabled).catch(
				toTRPCError,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId,
				resourceName: server.name,
				metadata: { type: "setFail2banEnabled", enabled: input.enabled },
			});
			return true;
		}),
	banIp: withPermission("server", "create")
		.input(serverInput.extend({ ip: ipSchema }))
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			await banFail2banIp(input.serverId, input.ip).catch(toTRPCError);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId,
				resourceName: server.name,
				metadata: { type: "banIp", ip: input.ip },
			});
			return true;
		}),
	unbanIp: withPermission("server", "create")
		.input(
			serverInput.extend({
				jail: z.string().regex(/^[\w.-]+$/),
				ip: ipSchema,
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			await unbanFail2banIp(input.serverId, input.jail, input.ip).catch(
				toTRPCError,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId,
				resourceName: server.name,
				metadata: { type: "unbanIp", jail: input.jail, ip: input.ip },
			});
			return true;
		}),
	exposedPorts: withPermission("server", "read")
		.input(serverInput)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(input.serverId, ctx.session);
			return getExposedPorts(input.serverId).catch(toTRPCError);
		}),
	sshSecurity: withPermission("server", "read")
		.input(serverInput)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(input.serverId, ctx.session);
			return getSshSecurity(input.serverId).catch(toTRPCError);
		}),
	updateSshSettings: withPermission("server", "create")
		.input(
			serverInput.extend({
				passwordAuthentication: z.boolean(),
				permitRootLogin: z.enum(["yes", "prohibit-password", "no"]),
				maxAuthTries: z.number().int().min(1).max(10),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			const { serverId, ...settings } = input;
			await updateSshSettings(serverId, settings).catch(toTRPCError);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: serverId,
				resourceName: server.name,
				metadata: { type: "updateSshSettings", ...settings },
			});
			return true;
		}),
	removeAuthorizedKey: withPermission("server", "create")
		.input(
			serverInput.extend({
				fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			await removeAuthorizedKey(input.serverId, input.fingerprint).catch(
				toTRPCError,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "server",
				resourceId: input.serverId,
				resourceName: server.name,
				metadata: {
					type: "removeAuthorizedKey",
					fingerprint: input.fingerprint,
				},
			});
			return true;
		}),
	pendingUpdates: withPermission("server", "read")
		.input(serverInput)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(input.serverId, ctx.session);
			return getPendingUpdates(input.serverId).catch(toTRPCError);
		}),
	disconnectSession: withPermission("server", "create")
		.input(
			serverInput.extend({
				terminal: z.string().regex(/^(pts\/\d+|tty\d+)$/),
				banIp: ipSchema.optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const server = await assertServerAccess(input.serverId, ctx.session);
			await disconnectSshSession(
				input.serverId,
				input.terminal,
				input.banIp,
			).catch(toTRPCError);
			await audit(ctx, {
				action: "update",
				resourceType: "server",
				resourceId: input.serverId,
				resourceName: server.name,
				metadata: {
					type: "disconnectSession",
					terminal: input.terminal,
					bannedIp: input.banIp ?? null,
				},
			});
			return true;
		}),
	activity: withPermission("server", "read")
		.input(serverInput)
		.query(async ({ input, ctx }) => {
			await assertServerAccess(input.serverId, ctx.session);
			return getServerActivity(input.serverId).catch(toTRPCError);
		}),
});
