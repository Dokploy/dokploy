import { db } from "@dokploy/server/db";
import {
	applications,
	cloudflareConfig,
	cloudflareZones,
	compose,
	domains,
	server,
} from "@dokploy/server/db/schema";
import {
	apiSaveCloudflareToken,
	apiVerifyCloudflareToken,
} from "@dokploy/server/db/schema/cloudflare-config";
import {
	apiAddCloudflareZones,
	apiRemoveCloudflareZone,
	apiTestCloudflareZone,
	apiToggleCloudflareZone,
} from "@dokploy/server/db/schema/cloudflare-zone";
import { pickTunnelAccount } from "@dokploy/server/services/cloudflare/account-picker";
import { listZones, verifyToken } from "@dokploy/server/services/cloudflare";
import {
	addCloudflareZones,
	checkSubdomainAvailability,
	pushAllServersToCloudflareForOrg,
	testCloudflareZone,
} from "@dokploy/server/services/cloudflare/orchestrator";
import { checkPermission } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { z } from "zod";
import { getAccessibleServerIds } from "@dokploy/server/services/server";
import { createTRPCRouter, protectedProcedure, withPermission } from "../trpc";

const redactConfig = <T extends { apiToken: string } | null | undefined>(
	row: T,
): T extends null | undefined
	? T
	: Omit<NonNullable<T>, "apiToken"> & { apiToken: string } => {
	if (!row) return row as never;
	return {
		...row,
		apiToken: row.apiToken ? "***" : "",
	} as never;
};

export const cloudflareRouter = createTRPCRouter({
	getConfig: withPermission("cloudflare", "read").query(async ({ ctx }) => {
		const config = await db.query.cloudflareConfig.findFirst({
			where: eq(
				cloudflareConfig.organizationId,
				ctx.session.activeOrganizationId,
			),
		});
		const zones = await db.query.cloudflareZones.findMany({
			where: eq(
				cloudflareZones.organizationId,
				ctx.session.activeOrganizationId,
			),
		});
		return {
			config: config ? redactConfig(config) : null,
			zones,
		};
	}),

	verifyToken: withPermission("cloudflare", "read")
		.input(apiVerifyCloudflareToken)
		.mutation(async ({ input }) => {
			return verifyToken(input.apiToken);
		}),

	saveToken: protectedProcedure
		.input(apiSaveCloudflareToken)
		.mutation(async ({ ctx, input }) => {
			const verification = await verifyToken(input.apiToken);
			if (!verification.ok || verification.accounts.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Cloudflare token is invalid or has no accessible accounts",
				});
			}

			const now = new Date().toISOString();
			const existing = await db.query.cloudflareConfig.findFirst({
				where: eq(
					cloudflareConfig.organizationId,
					ctx.session.activeOrganizationId,
				),
			});

			if (existing) {
				await checkPermission(ctx, { cloudflare: ["update"] });
				await db
					.update(cloudflareConfig)
					.set({
						apiToken: input.apiToken,
						accounts: verification.accounts,
						tokenScopes: verification.scopes,
						verifiedAt: now,
						updatedAt: now,
					})
					.where(
						eq(
							cloudflareConfig.cloudflareConfigId,
							existing.cloudflareConfigId,
						),
					);
			} else {
				await checkPermission(ctx, { cloudflare: ["create"] });
				await db.insert(cloudflareConfig).values({
					organizationId: ctx.session.activeOrganizationId,
					apiToken: input.apiToken,
					accounts: verification.accounts,
					tokenScopes: verification.scopes,
					verifiedAt: now,
				});
			}

			return { ok: true, accounts: verification.accounts };
		}),

	listAvailableZones: withPermission("cloudflare", "read").query(
		async ({ ctx }) => {
			const config = await db.query.cloudflareConfig.findFirst({
				where: eq(
					cloudflareConfig.organizationId,
					ctx.session.activeOrganizationId,
				),
			});
			if (!config) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "Cloudflare token not configured",
				});
			}
			return listZones(config.apiToken);
		},
	),

	addZones: withPermission("cloudflare", "update")
		.input(apiAddCloudflareZones)
		.mutation(({ ctx, input }) =>
			addCloudflareZones(ctx.session.activeOrganizationId, input.zones),
		),

	toggleZone: withPermission("cloudflare", "update")
		.input(apiToggleCloudflareZone)
		.mutation(async ({ ctx, input }) => {
			const result = await db
				.update(cloudflareZones)
				.set({ enabled: input.enabled })
				.where(
					and(
						eq(cloudflareZones.cloudflareZoneId, input.cloudflareZoneId),
						eq(
							cloudflareZones.organizationId,
							ctx.session.activeOrganizationId,
						),
					),
				)
				.returning();
			return result[0] ?? null;
		}),

	removeZone: withPermission("cloudflare", "update")
		.input(apiRemoveCloudflareZone)
		.mutation(async ({ ctx, input }) => {
			await db
				.delete(cloudflareZones)
				.where(
					and(
						eq(cloudflareZones.cloudflareZoneId, input.cloudflareZoneId),
						eq(
							cloudflareZones.organizationId,
							ctx.session.activeOrganizationId,
						),
					),
				);
			return { ok: true };
		}),

	testZone: withPermission("cloudflare", "read")
		.input(apiTestCloudflareZone)
		.mutation(({ ctx, input }) =>
			testCloudflareZone(
				ctx.session.activeOrganizationId,
				input.cloudflareZoneId,
			),
		),

	deleteConfig: withPermission("cloudflare", "delete").mutation(
		async ({ ctx }) => {
			const result = await db
				.delete(cloudflareConfig)
				.where(
					eq(cloudflareConfig.organizationId, ctx.session.activeOrganizationId),
				)
				.returning();
			return { deleted: result.length };
		},
	),

	pushAllServersToCloudflare: withPermission("cloudflare", "update").mutation(
		({ ctx }) =>
			pushAllServersToCloudflareForOrg(ctx.session.activeOrganizationId),
	),

	getServerTunnelAccountChoice: withPermission("cloudflare", "read")
		.input(z.object({ serverId: z.string().optional() }))
		.query(async ({ ctx }) => {
			const config = await db.query.cloudflareConfig.findFirst({
				where: eq(
					cloudflareConfig.organizationId,
					ctx.session.activeOrganizationId,
				),
			});
			if (!config) {
				return {
					candidate: null as string | null,
					ambiguous: false,
					accounts: [] as { id: string; name: string }[],
				};
			}
			const zoneRows = await db
				.select({ accountId: cloudflareZones.accountId })
				.from(cloudflareZones)
				.where(
					and(
						eq(
							cloudflareZones.organizationId,
							ctx.session.activeOrganizationId,
						),
						eq(cloudflareZones.enabled, true),
					),
				);
			const r = pickTunnelAccount({
				accounts: config.accounts,
				zoneAccountIds: zoneRows.map((z) => z.accountId),
				explicitAccountId: null,
			});
			return {
				candidate: r.kind === "ok" ? r.accountId : null,
				ambiguous: r.kind === "ambiguous",
				accounts: config.accounts,
			};
		}),

	listMismatchedDomains: withPermission("cloudflare", "read")
		.input(z.object({ serverId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const accessibleIds = await getAccessibleServerIds(ctx.session);
			if (!accessibleIds.has(input.serverId)) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Not authorized for this server",
				});
			}
			const srv = await db.query.server.findFirst({
				where: and(
					eq(server.serverId, input.serverId),
					eq(server.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!srv?.tunnelAccountId) return [];
			const rows = await db
				.select({
					domainId: domains.domainId,
					host: domains.host,
					zoneName: cloudflareZones.zoneName,
					zoneAccountId: cloudflareZones.accountId,
				})
				.from(domains)
				.leftJoin(
					applications,
					eq(applications.applicationId, domains.applicationId),
				)
				.leftJoin(compose, eq(compose.composeId, domains.composeId))
				.innerJoin(
					cloudflareZones,
					eq(domains.cloudflareZoneId, cloudflareZones.cloudflareZoneId),
				)
				.where(
					and(
						isNotNull(domains.cloudflareZoneId),
						or(
							eq(applications.serverId, input.serverId),
							eq(compose.serverId, input.serverId),
						),
					),
				);
			return rows
				.filter((r) => r.zoneAccountId !== srv.tunnelAccountId)
				.map((r) => ({
					domainId: r.domainId,
					host: r.host,
					zoneName: r.zoneName,
					zoneAccountId: r.zoneAccountId,
					tunnelAccountId: srv.tunnelAccountId!,
				}));
		}),

	checkSubdomainAvailability: withPermission("cloudflare", "read")
		.input(
			z.object({
				cloudflareZoneId: z.string().min(1),
				subdomain: z.string(),
			}),
		)
		.query(({ ctx, input }) =>
			checkSubdomainAvailability(
				ctx.session.activeOrganizationId,
				input.cloudflareZoneId,
				input.subdomain,
			),
		),
});
