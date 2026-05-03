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
	installCloudflaredOnServer,
	uninstallCloudflaredOnServer,
} from "@dokploy/server/setup/cloudflare-tunnel-setup";
import { TRPCError } from "@trpc/server";
import { and, eq, isNotNull, or } from "drizzle-orm";
import { pickTunnelAccount } from "./account-picker";
import {
	buildIngress,
	createDnsRecord,
	createTunnel,
	deleteDnsRecord,
	deleteTunnel,
	getDnsRecord,
	getTunnel,
	type IngressRule,
	listDnsRecords,
	updateIngress,
} from "./index";

interface ServerWithOrg {
	serverId: string;
	organizationId: string;
	tunnelId: string | null;
	tunnelToken: string | null;
	tunnelAccountId: string | null;
	tunnelStatus:
		| "disabled"
		| "provisioning"
		| "installing"
		| "registering"
		| "healthy"
		| "error";
}

export const findCloudflareConfigForOrg = async (organizationId: string) => {
	return db.query.cloudflareConfig.findFirst({
		where: eq(cloudflareConfig.organizationId, organizationId),
	});
};

export const hasCloudflareConfig = async (
	organizationId: string,
): Promise<boolean> => {
	const config = await findCloudflareConfigForOrg(organizationId);
	return Boolean(config);
};

export const assertZoneTunnelAccountMatch = (args: {
	zoneName: string;
	zoneAccountId: string;
	serverName: string;
	tunnelAccountId: string | null;
}): void => {
	if (!args.tunnelAccountId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Server ${args.serverName} has no Cloudflare account bound to its tunnel.`,
		});
	}
	if (args.zoneAccountId !== args.tunnelAccountId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Cannot route ${args.zoneName} via ${args.serverName}: zone is in Cloudflare account ${args.zoneAccountId}, server's tunnel is in ${args.tunnelAccountId}.`,
		});
	}
};

const setTunnelState = (
	serverId: string,
	state: Partial<{
		tunnelStatus: ServerWithOrg["tunnelStatus"];
		tunnelId: string | null;
		tunnelToken: string | null;
		tunnelAccountId: string | null;
		tunnelError: string | null;
		tunnelCheckedAt: string | null;
	}>,
) =>
	db
		.update(server)
		.set({ ...state, tunnelCheckedAt: new Date().toISOString() })
		.where(eq(server.serverId, serverId));

const setDomainSync = (
	domainId: string,
	state: Partial<{
		cloudflareRecordId: string | null;
		cloudflareSyncStatus: "pending" | "synced" | "conflict" | "error";
		cloudflareSyncError: string | null;
	}>,
) => {
	const payload =
		state.cloudflareSyncStatus === "synced"
			? { ...state, cloudflareSyncedAt: new Date().toISOString() }
			: state;
	return db.update(domains).set(payload).where(eq(domains.domainId, domainId));
};

const findServer = async (serverId: string) => {
	const row = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
	});
	if (!row) throw new Error(`Server ${serverId} not found`);
	return row;
};

const buildIngressForServer = async (
	serverId: string,
): Promise<IngressRule[]> => {
	const rows = await db
		.select({
			host: domains.host,
			path: domains.path,
			appServerId: applications.serverId,
			composeServerId: compose.serverId,
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
				eq(domains.cloudflareSyncStatus, "synced"),
			),
		);

	const filtered = rows.filter(
		(r) => r.appServerId === serverId || r.composeServerId === serverId,
	);

	// All ingress on a server tunnel routes to local Traefik on :80
	return buildIngress({
		hostnames: filtered.map((r) => ({
			hostname: r.host,
			service: "http://localhost:80",
		})),
	});
};

export const provisionServerTunnel = async (
	serverId: string,
	onData?: (data: string) => void,
): Promise<void> => {
	const srv = await findServer(serverId);
	const config = await findCloudflareConfigForOrg(srv.organizationId);
	if (!config) {
		onData?.(
			"Cloudflare not configured for this organization — skipping tunnel.\n",
		);
		return;
	}

	try {
		await setTunnelState(serverId, {
			tunnelStatus: "provisioning",
			tunnelError: null,
		});

		let tunnelId = srv.tunnelId;
		let tunnelToken = srv.tunnelToken;
		let tunnelAccountId = srv.tunnelAccountId;

		if (!tunnelId || !tunnelToken) {
			const zones = await db
				.select({ accountId: cloudflareZones.accountId })
				.from(cloudflareZones)
				.where(
					and(
						eq(cloudflareZones.organizationId, srv.organizationId),
						eq(cloudflareZones.enabled, true),
					),
				);
			const pick = pickTunnelAccount({
				accounts: config.accounts,
				zoneAccountIds: zones.map((z) => z.accountId),
				explicitAccountId: tunnelAccountId,
			});
			if (pick.kind !== "ok") {
				const msg =
					pick.kind === "ambiguous"
						? "Cloudflare account is ambiguous for this server. Set the server's Cloudflare account explicitly before provisioning the tunnel."
						: pick.message;
				throw new TRPCError({ code: "BAD_REQUEST", message: msg });
			}
			tunnelAccountId = pick.accountId;

			onData?.("Creating Cloudflare tunnel...\n");
			const created = await createTunnel(
				config.apiToken,
				tunnelAccountId,
				`dokploy-${srv.organizationId.slice(0, 8)}-${srv.serverId.slice(0, 8)}`,
			);
			tunnelId = created.id;
			tunnelToken = created.token;
			await setTunnelState(serverId, {
				tunnelId,
				tunnelToken,
				tunnelAccountId,
			});
		}

		if (!tunnelAccountId) {
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Tunnel exists but has no bound Cloudflare account",
			});
		}

		await setTunnelState(serverId, { tunnelStatus: "installing" });
		onData?.("Installing cloudflared on server...\n");
		await installCloudflaredOnServer(serverId, tunnelToken, onData);

		await setTunnelState(serverId, { tunnelStatus: "registering" });
		onData?.("Waiting for tunnel to register...\n");
		const deadline = Date.now() + 60_000;
		let registered = false;
		while (Date.now() < deadline) {
			const info = await getTunnel(config.apiToken, tunnelAccountId, tunnelId);
			if (info.connections > 0) {
				registered = true;
				break;
			}
			await new Promise<void>((r) => setTimeout(r, 3000));
		}
		if (!registered) {
			throw new Error(
				`Tunnel registration timeout: tunnel ${tunnelId} on account ${tunnelAccountId} did not establish any connections within 60s`,
			);
		}

		// Push initial ingress (catch-all → local traefik)
		await updateIngress(
			config.apiToken,
			tunnelAccountId,
			tunnelId,
			buildIngress({ hostnames: [] }),
		);

		await setTunnelState(serverId, {
			tunnelStatus: "healthy",
			tunnelError: null,
		});
		onData?.("Cloudflare tunnel healthy ✅\n");
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await setTunnelState(serverId, {
			tunnelStatus: "error",
			tunnelError: message.slice(0, 500),
		});
		onData?.(`Tunnel provisioning failed: ${message}\n`);
		throw err;
	}
};

const buildHostFromDomain = async (
	domainId: string,
	subdomain?: string,
): Promise<{
	host: string;
	zone: typeof cloudflareZones.$inferSelect;
}> => {
	const row = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
	});
	if (!row?.cloudflareZoneId)
		throw new Error("Domain is not Cloudflare-managed");
	const zone = await db.query.cloudflareZones.findFirst({
		where: eq(cloudflareZones.cloudflareZoneId, row.cloudflareZoneId),
	});
	if (!zone) throw new Error("CF zone not found");
	const sub = subdomain ?? row.host.replace(`.${zone.zoneName}`, "").trim();
	const host =
		sub === "" || sub === zone.zoneName
			? zone.zoneName
			: `${sub}.${zone.zoneName}`;
	return { host, zone };
};

const findServerForDomain = async (domainId: string) => {
	const row = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
		with: { application: true, compose: true },
	});
	if (!row) throw new Error("Domain not found");
	const serverId = row.application?.serverId ?? row.compose?.serverId ?? null;
	if (!serverId) {
		throw new Error("Domain is not attached to a remote server");
	}
	return findServer(serverId);
};

const reapplyIngress = async (serverId: string) => {
	const srv = await findServer(serverId);
	if (!srv.tunnelId || !srv.tunnelAccountId) return;
	const config = await findCloudflareConfigForOrg(srv.organizationId);
	if (!config) return;
	const ingress = await buildIngressForServer(serverId);
	await updateIngress(
		config.apiToken,
		srv.tunnelAccountId,
		srv.tunnelId,
		ingress,
	);
};

export const syncDomain = async (domainId: string): Promise<void> => {
	const dom = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
	});
	if (!dom?.cloudflareZoneId) return;

	const srv = await findServerForDomain(domainId);
	if (!srv.tunnelId) {
		await setDomainSync(domainId, {
			cloudflareSyncStatus: "error",
			cloudflareSyncError: "Server has no Cloudflare tunnel",
		});
		return;
	}

	const config = await findCloudflareConfigForOrg(srv.organizationId);
	if (!config) {
		await setDomainSync(domainId, {
			cloudflareSyncStatus: "error",
			cloudflareSyncError: "Cloudflare not configured",
		});
		return;
	}

	const zone = await db.query.cloudflareZones.findFirst({
		where: eq(cloudflareZones.cloudflareZoneId, dom.cloudflareZoneId),
	});
	if (!zone) {
		await setDomainSync(domainId, {
			cloudflareSyncStatus: "error",
			cloudflareSyncError: "CF zone not found",
		});
		return;
	}

	try {
		await setDomainSync(domainId, {
			cloudflareSyncStatus: "pending",
			cloudflareSyncError: null,
		});

		assertZoneTunnelAccountMatch({
			zoneName: zone.zoneName,
			zoneAccountId: zone.accountId,
			serverName: srv.name,
			tunnelAccountId: srv.tunnelAccountId,
		});

		const cnameTarget = `${srv.tunnelId}.cfargotunnel.com`;

		let recordId = dom.cloudflareRecordId;
		// Verify the cached record still exists in Cloudflare and points where we expect.
		// Otherwise the domain row would falsely report "synced" after manual deletion or edit.
		if (recordId) {
			const existing = await getDnsRecord(
				config.apiToken,
				zone.zoneId,
				recordId,
			);
			const matches =
				existing &&
				existing.name === dom.host &&
				existing.content === cnameTarget;
			if (!matches) {
				recordId = null;
			}
		}
		if (!recordId) {
			const record = await createDnsRecord(config.apiToken, zone.zoneId, {
				name: dom.host,
				content: cnameTarget,
				proxied: true,
			});
			recordId = record.id;
		}
		await setDomainSync(domainId, {
			cloudflareRecordId: recordId,
			cloudflareSyncStatus: "synced",
		});

		await reapplyIngress(srv.serverId);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		await setDomainSync(domainId, {
			cloudflareSyncStatus: "error",
			cloudflareSyncError: message.slice(0, 500),
		});
		throw err;
	}
};

export const unsyncDomain = async (domainId: string): Promise<void> => {
	const dom = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
	});
	if (!dom?.cloudflareZoneId || !dom.cloudflareRecordId) return;

	const zone = await db.query.cloudflareZones.findFirst({
		where: eq(cloudflareZones.cloudflareZoneId, dom.cloudflareZoneId),
	});
	if (!zone) return;

	const config = await findCloudflareConfigForOrg(zone.organizationId);
	if (!config) return;

	try {
		await deleteDnsRecord(config.apiToken, zone.zoneId, dom.cloudflareRecordId);
	} catch {
		// best-effort: record may already be gone
	}

	const srv = await findServerForDomain(domainId).catch(() => null);
	if (srv) {
		await reapplyIngress(srv.serverId).catch(() => {});
	}
};

/**
 * Brief-overlap rename procedure.
 * Order: PUT ingress with both → create new DNS → persist → delete old DNS → PUT without old.
 * Both names live for ~5s; no downtime; DB never references a deleted record.
 */
export const renameDomainHost = async (
	domainId: string,
	newHost: string,
): Promise<void> => {
	const dom = await db.query.domains.findFirst({
		where: eq(domains.domainId, domainId),
	});
	if (!dom) throw new Error("Domain not found");
	if (!dom.cloudflareZoneId) {
		await db
			.update(domains)
			.set({ host: newHost })
			.where(eq(domains.domainId, domainId));
		return;
	}
	if (dom.host === newHost) return;

	const zone = await db.query.cloudflareZones.findFirst({
		where: eq(cloudflareZones.cloudflareZoneId, dom.cloudflareZoneId),
	});
	if (!zone) throw new Error("CF zone not found");

	const config = await findCloudflareConfigForOrg(zone.organizationId);
	if (!config) throw new Error("Cloudflare not configured");

	const srv = await findServerForDomain(domainId);
	if (!srv.tunnelId) throw new Error("Server has no tunnel");

	assertZoneTunnelAccountMatch({
		zoneName: zone.zoneName,
		zoneAccountId: zone.accountId,
		serverName: srv.name,
		tunnelAccountId: srv.tunnelAccountId,
	});

	const oldHost = dom.host;
	const oldRecordId = dom.cloudflareRecordId;
	const cnameTarget = `${srv.tunnelId}.cfargotunnel.com`;

	// Step 1: ingress with both
	const baseIngress = await buildIngressForServer(srv.serverId);
	const filtered = baseIngress.filter((r) => r.hostname !== oldHost);
	const overlap = [
		...filtered,
		{ hostname: oldHost, service: "http://localhost:80" },
		{ hostname: newHost, service: "http://localhost:80" },
		{ service: "http_status:404" },
	].filter((r, i, arr) => {
		// Drop the original terminator from baseIngress; keep the one we just appended
		if (r.service === "http_status:404") return i === arr.length - 1;
		return true;
	});
	await updateIngress(
		config.apiToken,
		srv.tunnelAccountId!,
		srv.tunnelId,
		overlap,
	);

	// Step 2: create new DNS
	const newRecord = await createDnsRecord(config.apiToken, zone.zoneId, {
		name: newHost,
		content: cnameTarget,
		proxied: true,
	});

	// Step 3: persist
	await db
		.update(domains)
		.set({
			host: newHost,
			cloudflareRecordId: newRecord.id,
			cloudflareSyncStatus: "synced",
			cloudflareSyncError: null,
			cloudflareSyncedAt: new Date().toISOString(),
		})
		.where(eq(domains.domainId, domainId));

	// Step 4: delete old DNS
	if (oldRecordId) {
		await deleteDnsRecord(config.apiToken, zone.zoneId, oldRecordId).catch(
			() => {},
		);
	}

	// Step 5: PUT ingress without the old entry
	await reapplyIngress(srv.serverId);
};

export const pushServerToCloudflare = async (
	serverId: string,
): Promise<void> => {
	const srv = await findServer(serverId);
	const config = await findCloudflareConfigForOrg(srv.organizationId);
	if (!config) return;
	if (!srv.tunnelId || !srv.tunnelAccountId) return;

	// Push DB-truth ingress to CF
	await reapplyIngress(serverId);

	// Re-create any missing CNAMEs based on DB state, scoped to this server only.
	// Domains whose zone is in a different account than the server's tunnel are
	// skipped with a warning — they need a Repair flow before they can route.
	const cfDomains = await db
		.select({
			domainId: domains.domainId,
			cloudflareRecordId: domains.cloudflareRecordId,
			zoneAccountId: cloudflareZones.accountId,
			zoneName: cloudflareZones.zoneName,
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
				or(eq(applications.serverId, serverId), eq(compose.serverId, serverId)),
			),
		);

	for (const row of cfDomains) {
		if (row.zoneAccountId !== srv.tunnelAccountId) {
			console.warn(
				`[cloudflare] skipping domain ${row.domainId}: zone ${row.zoneName} is in account ${row.zoneAccountId} but server tunnel is in ${srv.tunnelAccountId}`,
			);
			continue;
		}
		if (!row.cloudflareRecordId) {
			await syncDomain(row.domainId).catch(() => {});
		}
	}
};

export const cleanupServer = async (
	serverId: string,
	withSsh: boolean,
	onData?: (data: string) => void,
): Promise<void> => {
	const srv = await db.query.server.findFirst({
		where: eq(server.serverId, serverId),
	});
	if (!srv) return;
	const config = await findCloudflareConfigForOrg(srv.organizationId);

	// Delete DNS records for domains bound to this server's tunnel
	if (config && srv.tunnelId) {
		const ownedDomains = await db
			.select({
				cloudflareRecordId: domains.cloudflareRecordId,
				zoneId: cloudflareZones.zoneId,
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
						eq(applications.serverId, serverId),
						eq(compose.serverId, serverId),
					),
				),
			);

		for (const row of ownedDomains) {
			if (!row.cloudflareRecordId) continue;
			await deleteDnsRecord(
				config.apiToken,
				row.zoneId,
				row.cloudflareRecordId,
			).catch(() => {});
		}

		if (srv.tunnelAccountId) {
			await deleteTunnel(
				config.apiToken,
				srv.tunnelAccountId,
				srv.tunnelId,
			).catch(() => {});
		}
	}

	if (withSsh && srv.tunnelToken) {
		await uninstallCloudflaredOnServer(serverId, onData).catch(() => {});
	}
};

const requireConfigForOrg = async (organizationId: string) => {
	const config = await findCloudflareConfigForOrg(organizationId);
	if (!config) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: "Cloudflare token not configured",
		});
	}
	return config;
};

export const addCloudflareZones = async (
	organizationId: string,
	zones: Array<{
		zoneId: string;
		zoneName: string;
		accountId: string;
		status?: string | null;
	}>,
) => {
	const config = await requireConfigForOrg(organizationId);
	return db
		.insert(cloudflareZones)
		.values(
			zones.map((z) => ({
				organizationId,
				cloudflareConfigId: config.cloudflareConfigId,
				zoneId: z.zoneId,
				zoneName: z.zoneName,
				accountId: z.accountId,
				status: z.status ?? null,
			})),
		)
		.onConflictDoNothing()
		.returning();
};

export const testCloudflareZone = async (
	organizationId: string,
	cloudflareZoneId: string,
) => {
	const zone = await db.query.cloudflareZones.findFirst({
		where: and(
			eq(cloudflareZones.cloudflareZoneId, cloudflareZoneId),
			eq(cloudflareZones.organizationId, organizationId),
		),
	});
	if (!zone) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
	}
	const config = await requireConfigForOrg(organizationId);
	const records = await listDnsRecords(config.apiToken, zone.zoneId);
	return { ok: true as const, recordCount: records.length };
};

export const pushAllServersToCloudflareForOrg = async (
	organizationId: string,
) => {
	const servers = await db.query.server.findMany({
		where: eq(server.organizationId, organizationId),
	});
	let ok = 0;
	let failed = 0;
	const errors: Array<{ serverId: string; error: string }> = [];
	for (const s of servers) {
		if (!s.tunnelId) continue;
		try {
			await pushServerToCloudflare(s.serverId);
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
};

export const checkSubdomainAvailability = async (
	organizationId: string,
	cloudflareZoneId: string,
	subdomain: string,
) => {
	const zone = await db.query.cloudflareZones.findFirst({
		where: and(
			eq(cloudflareZones.cloudflareZoneId, cloudflareZoneId),
			eq(cloudflareZones.organizationId, organizationId),
		),
	});
	if (!zone) {
		throw new TRPCError({ code: "NOT_FOUND", message: "Zone not found" });
	}
	const config = await requireConfigForOrg(organizationId);
	const fullHost =
		subdomain.trim() === ""
			? zone.zoneName
			: `${subdomain.trim()}.${zone.zoneName}`;
	const existing = await listDnsRecords(config.apiToken, zone.zoneId, {
		name: fullHost,
	});
	return {
		host: fullHost,
		cloudflareConflict: existing.length > 0,
		existingType: existing[0]?.type ?? null,
		comment: existing[0]?.comment ?? null,
	};
};
