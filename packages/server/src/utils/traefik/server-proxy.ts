import { isIP } from "node:net";
import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { server as serverTable } from "@dokploy/server/db/schema";
import type { Domain } from "@dokploy/server/services/domain";
import { eq } from "drizzle-orm";
import {
	removeTraefikConfig,
	withTraefikConfigLock,
	writeTraefikConfig,
} from "./application";
import { toPunycode } from "./domain";
import type { FileConfig } from "./file-types";

type ProxiedServer = Pick<
	typeof serverTable.$inferSelect,
	"appName" | "ipAddress" | "privateIpAddress"
>;

type ProxiedDomain = Pick<
	Domain,
	"host" | "https" | "enabled" | "customEntrypoint"
>;

const REMOTE_HTTP_PORT = 80;
const REMOTE_HTTPS_PORT = 443;

export const serverProxyConfigName = (serverAppName: string) =>
	`proxy-${serverAppName}`;

const hostSlug = (host: string) =>
	host
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const buildServerProxyConfig = (
	server: ProxiedServer,
	domains: ProxiedDomain[],
): FileConfig | null => {
	const target = (server.privateIpAddress || server.ipAddress).trim();
	const address = isIP(target) === 6 ? `[${target}]` : target;

	// A host can back several domains (one per path); the remote Traefik does
	// the path routing, so the main server only needs one route per host.
	const hosts = new Map<string, { https: boolean }>();
	for (const domain of domains) {
		// Custom entrypoints are not guaranteed to exist on the main Traefik,
		// and wildcard hosts cannot be matched by Host/HostSNI.
		if (!domain.enabled || domain.customEntrypoint) continue;
		const host = toPunycode(domain.host.trim());
		if (!host || host.includes("*")) continue;
		const current = hosts.get(host);
		hosts.set(host, { https: domain.https || !!current?.https });
	}

	if (hosts.size === 0) return null;

	const serviceName = `${server.appName}-traefik`;
	const config: FileConfig = {
		http: {
			routers: {},
			services: {
				[serviceName]: {
					loadBalancer: {
						servers: [{ url: `http://${address}:${REMOTE_HTTP_PORT}` }],
						passHostHeader: true,
					},
				},
			},
		},
	};

	const tcpRouters: NonNullable<FileConfig["tcp"]>["routers"] = {};

	for (const [host, { https }] of hosts) {
		const routerName = `${server.appName}-proxy-${hostSlug(host)}`;
		// Plain HTTP is forwarded as-is so the remote Traefik keeps answering
		// Let's Encrypt HTTP-01 challenges and its own redirect-to-https.
		config.http!.routers![routerName] = {
			rule: `Host(\`${host}\`)`,
			service: serviceName,
			entryPoints: ["web"],
		};
		if (https) {
			tcpRouters[`${routerName}-passthrough`] = {
				rule: `HostSNI(\`${host}\`)`,
				service: serviceName,
				entryPoints: ["websecure"],
				tls: { passthrough: true },
			};
		}
	}

	if (Object.keys(tcpRouters).length > 0) {
		config.tcp = {
			routers: tcpRouters,
			services: {
				[serviceName]: {
					loadBalancer: {
						servers: [{ address: `${address}:${REMOTE_HTTPS_PORT}` }],
					},
				},
			},
		};
	}

	return config;
};

const findServerWithDomains = (serverId: string) =>
	db.query.server.findFirst({
		where: eq(serverTable.serverId, serverId),
		columns: {
			appName: true,
			ipAddress: true,
			privateIpAddress: true,
			routeThroughMainServer: true,
		},
		with: {
			applications: {
				columns: { applicationId: true },
				with: {
					domains: true,
					previewDeployments: {
						columns: { previewDeploymentId: true },
						with: { domain: true },
					},
				},
			},
			compose: {
				columns: { composeId: true },
				with: { domains: true },
			},
		},
	});

/**
 * Regenerates the routes the main server's Traefik uses to reach the domains
 * hosted on a remote server that sits behind the main server's public IP.
 * The file is rebuilt from the database on every call, so it is safe to call
 * after any change to the server or its domains.
 */
export const syncServerProxyRoutes = async (serverId?: string | null) => {
	if (!serverId || IS_CLOUD) return;

	try {
		const server = await findServerWithDomains(serverId);
		if (!server) return;

		const configName = serverProxyConfigName(server.appName);
		const domains = server.routeThroughMainServer
			? [
					...server.applications.flatMap((application) => [
						...application.domains,
						...application.previewDeployments.flatMap((preview) =>
							preview.domain ? [preview.domain] : [],
						),
					]),
					...server.compose.flatMap((compose) => compose.domains),
				]
			: [];

		const config = server.routeThroughMainServer
			? buildServerProxyConfig(server, domains)
			: null;

		await withTraefikConfigLock(configName, null, async () => {
			if (config) {
				writeTraefikConfig(config, configName);
			} else {
				await removeTraefikConfig(configName);
			}
		});
	} catch (error) {
		console.error(
			`Error syncing main server proxy routes for server ${serverId}:`,
			error,
		);
	}
};

export const removeServerProxyRoutes = async (serverAppName: string) => {
	if (IS_CLOUD) return;
	await removeTraefikConfig(serverProxyConfigName(serverAppName));
};

export const findDomainServerId = async (
	domain: Pick<Domain, "applicationId" | "composeId" | "previewDeploymentId">,
): Promise<string | null> => {
	if (domain.applicationId) {
		const application = await db.query.applications.findFirst({
			where: (table, { eq }) => eq(table.applicationId, domain.applicationId!),
			columns: { serverId: true },
		});
		return application?.serverId ?? null;
	}
	if (domain.composeId) {
		const compose = await db.query.compose.findFirst({
			where: (table, { eq }) => eq(table.composeId, domain.composeId!),
			columns: { serverId: true },
		});
		return compose?.serverId ?? null;
	}
	if (domain.previewDeploymentId) {
		const preview = await db.query.previewDeployments.findFirst({
			where: (table, { eq }) =>
				eq(table.previewDeploymentId, domain.previewDeploymentId!),
			columns: { previewDeploymentId: true },
			with: { application: { columns: { serverId: true } } },
		});
		return preview?.application?.serverId ?? null;
	}
	return null;
};

export const syncProxyRoutesForDomain = async (
	domain: Pick<Domain, "applicationId" | "composeId" | "previewDeploymentId">,
) => {
	if (IS_CLOUD) return;
	try {
		await syncServerProxyRoutes(await findDomainServerId(domain));
	} catch (error) {
		console.error("Error syncing main server proxy routes:", error);
	}
};
