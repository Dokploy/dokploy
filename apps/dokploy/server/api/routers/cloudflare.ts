import { db } from "@dokploy/server/db";
import {
	cloudflareConfig,
	cloudflareZones,
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
import {
	listDnsRecords,
	listZones,
	verifyToken,
} from "@dokploy/server/services/cloudflare";
import { reconcileServer } from "@dokploy/server/services/cloudflare/orchestrator";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../trpc";

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

	saveToken: withPermission("cloudflare", "create")
		.input(apiSaveCloudflareToken)
		.mutation(async ({ ctx, input }) => {
			const verification = await verifyToken(input.apiToken);
			if (!verification.ok || !verification.accountId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Cloudflare token is invalid or missing required scopes",
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
				await db
					.update(cloudflareConfig)
					.set({
						apiToken: input.apiToken,
						accountId: verification.accountId,
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
				await db.insert(cloudflareConfig).values({
					organizationId: ctx.session.activeOrganizationId,
					apiToken: input.apiToken,
					accountId: verification.accountId,
					tokenScopes: verification.scopes,
					verifiedAt: now,
				});
			}

			return { ok: true, accountId: verification.accountId };
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
		.mutation(async ({ ctx, input }) => {
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

			const inserted = await db
				.insert(cloudflareZones)
				.values(
					input.zones.map((z) => ({
						organizationId: ctx.session.activeOrganizationId,
						cloudflareConfigId: config.cloudflareConfigId,
						zoneId: z.zoneId,
						zoneName: z.zoneName,
						accountId: z.accountId,
						status: z.status ?? null,
					})),
				)
				.onConflictDoNothing()
				.returning();
			return inserted;
		}),

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
		.mutation(async ({ ctx, input }) => {
			const zone = await db.query.cloudflareZones.findFirst({
				where: and(
					eq(cloudflareZones.cloudflareZoneId, input.cloudflareZoneId),
					eq(cloudflareZones.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!zone) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
			}
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
			const records = await listDnsRecords(config.apiToken, zone.zoneId);
			return { ok: true, recordCount: records.length };
		}),

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

	reconcileAllServers: withPermission("cloudflare", "update").mutation(
		async ({ ctx }) => {
			const servers = await db.query.server.findMany({
				where: eq(server.organizationId, ctx.session.activeOrganizationId),
			});
			let ok = 0;
			let failed = 0;
			const errors: Array<{ serverId: string; error: string }> = [];
			for (const s of servers) {
				if (!s.tunnelId) continue;
				try {
					await reconcileServer(s.serverId);
					ok += 1;
				} catch (e) {
					failed += 1;
					errors.push({
						serverId: s.serverId,
						error: e instanceof Error ? e.message : String(e),
					});
				}
			}
			return { ok, failed, errors };
		},
	),

	checkSubdomainAvailability: withPermission("cloudflare", "read")
		.input(
			z.object({
				cloudflareZoneId: z.string().min(1),
				subdomain: z.string(),
			}),
		)
		.query(async ({ ctx, input }) => {
			const zone = await db.query.cloudflareZones.findFirst({
				where: and(
					eq(cloudflareZones.cloudflareZoneId, input.cloudflareZoneId),
					eq(cloudflareZones.organizationId, ctx.session.activeOrganizationId),
				),
			});
			if (!zone) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
			}
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
			const fullHost =
				input.subdomain.trim() === ""
					? zone.zoneName
					: `${input.subdomain.trim()}.${zone.zoneName}`;
			const existing = await listDnsRecords(config.apiToken, zone.zoneId, {
				name: fullHost,
			});
			return {
				host: fullHost,
				cloudflareConflict: existing.length > 0,
				existingType: existing[0]?.type ?? null,
				comment: existing[0]?.comment ?? null,
			};
		}),
});
