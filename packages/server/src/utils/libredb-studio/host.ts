import { domainToUnicode } from "node:url";
import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	domains,
	libredbStudio,
	previewDeployments,
} from "@dokploy/server/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export type DomainTarget = {
	applicationId?: string | null;
	composeId?: string | null;
	previewDeploymentId?: string | null;
};

// Traefik routes on the punycode form createRouterConfig builds, and a longer
// rule (a path) wins, so any domain with a Studio's host can take its launch URL.
export const toRoutedHost = (host: string) => {
	const trimmed = host.trim().toLowerCase();
	try {
		return new URL(`http://${trimmed}`).hostname.replace(/\.$/, "");
	} catch {
		return trimmed;
	}
};

// Each server runs its own Traefik, so a host only competes with the domains
// of services on the same server (null is the Dokploy server itself). Null
// when a named service does not exist or none is named, so callers refuse.
export const findDomainServerIds = async (
	target: DomainTarget,
): Promise<(string | null)[] | null> => {
	const [application, composeRow, preview] = await Promise.all([
		target.applicationId
			? db.query.applications.findFirst({
					where: eq(applications.applicationId, target.applicationId),
					columns: { serverId: true },
				})
			: undefined,
		target.composeId
			? db.query.compose.findFirst({
					where: eq(compose.composeId, target.composeId),
					columns: { serverId: true },
				})
			: undefined,
		target.previewDeploymentId
			? db.query.previewDeployments.findFirst({
					where: eq(
						previewDeployments.previewDeploymentId,
						target.previewDeploymentId,
					),
					columns: { previewDeploymentId: true },
					with: { application: { columns: { serverId: true } } },
				})
			: undefined,
	]);
	if (
		(target.applicationId && !application) ||
		(target.composeId && !composeRow) ||
		(target.previewDeploymentId && !preview)
	) {
		return null;
	}
	const serverIds = [
		application?.serverId,
		composeRow?.serverId,
		preview?.application.serverId,
	].filter((serverId): serverId is string | null => serverId !== undefined);
	return serverIds.length > 0 ? serverIds : null;
};

// The hosts are stored as typed, so the query normalizes them like
// toRoutedHost, and an IDN may be stored in its Unicode or punycode form.
const whereStoredHost = (routedHost: string) => {
	const storedForms = [
		...new Set([routedHost, domainToUnicode(routedHost)]),
	].filter((form) => form !== "");
	return inArray(sql`lower(rtrim(trim(${domains.host}), '.'))`, storedForms);
};

export const isLibreDBStudioHost = async (
	host: string,
	serverIds: (string | null)[],
): Promise<boolean> => {
	const routedHost = toRoutedHost(host);
	const hostDomains = await db.query.domains.findMany({
		where: whereStoredHost(routedHost),
		columns: { host: true, applicationId: true },
		with: { application: { columns: { serverId: true } } },
	});
	const applicationIds = hostDomains
		.filter(
			(domain) =>
				domain.application !== null &&
				serverIds.includes(domain.application.serverId) &&
				toRoutedHost(domain.host) === routedHost,
		)
		.flatMap((domain) => (domain.applicationId ? [domain.applicationId] : []));
	if (applicationIds.length === 0) return false;
	const studio = await db.query.libredbStudio.findFirst({
		where: inArray(libredbStudio.applicationId, applicationIds),
		columns: { libredbStudioId: true },
	});
	return !!studio;
};

type DomainService = {
	application: { serverId: string | null } | null;
	compose: { serverId: string | null } | null;
	previewDeployment: { application: { serverId: string | null } } | null;
};

const serviceServerId = (domain: DomainService) => {
	if (domain.application) return domain.application.serverId;
	if (domain.compose) return domain.compose.serverId;
	return domain.previewDeployment?.application.serverId;
};

// A domain of another service with the Studio's host and a path wins the
// Traefik rule, and receives the launch URL with an owner's token.
export const isHostUsedByAnotherService = async ({
	host,
	serverId,
	studioApplicationId,
}: {
	host: string;
	serverId: string | null;
	studioApplicationId?: string;
}): Promise<boolean> => {
	const routedHost = toRoutedHost(host);
	const domainRows = await db.query.domains.findMany({
		where: whereStoredHost(routedHost),
		columns: { host: true, applicationId: true },
		with: {
			application: { columns: { serverId: true } },
			compose: { columns: { serverId: true } },
			previewDeployment: {
				columns: { previewDeploymentId: true },
				with: { application: { columns: { serverId: true } } },
			},
		},
	});
	return domainRows.some(
		(domain) =>
			(studioApplicationId === undefined ||
				domain.applicationId !== studioApplicationId) &&
			serviceServerId(domain) === serverId &&
			toRoutedHost(domain.host) === routedHost,
	);
};
