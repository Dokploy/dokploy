import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { quote } from "shell-quote";
import { stringify } from "yaml";
import {
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	withTraefikConfigLock,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type {
	FileConfig,
	HttpServersTransport,
	HttpService,
} from "./file-types";

/**
 * Dokploy routes to a service's Swarm VIP, which balances per connection.
 * Traefik keeps connections alive, so with reuse every request would go to
 * the same replica. A connection per request spreads them, and the VIP
 * drops a stopping replica before it stops, which Traefik's polled task
 * list does not. For a dnsrr service each new connection resolves the name
 * again, which spreads requests and skips stopping replicas the same way.
 */
export const VIP_TRANSPORT: HttpServersTransport = { maxIdleConnsPerHost: -1 };

export const applicationTransportName = (appName: string) => `${appName}-vip`;

export const STACK_TRANSPORT = "dokploy-vip";

const STACK_TRANSPORT_FILE = `${STACK_TRANSPORT}.yml`;

export const setApplicationTransport = (
	config: FileConfig,
	appName: string,
) => {
	if (!config.http) return false;
	const name = applicationTransportName(appName);
	const loadBalancerOf = (service: HttpService) =>
		"loadBalancer" in service ? service.loadBalancer : undefined;
	let changed = false;
	for (const [key, service] of Object.entries(config.http.services ?? {})) {
		const loadBalancer = loadBalancerOf(service);
		if (!key.startsWith(`${appName}-service-`) || !loadBalancer?.servers) {
			continue;
		}
		if (!loadBalancer.serversTransport) {
			loadBalancer.serversTransport = name;
			changed = true;
		}
	}
	const used = Object.values(config.http.services ?? {}).some(
		(service) => loadBalancerOf(service)?.serversTransport === name,
	);
	const transports = config.http.serversTransports ?? {};
	if (used && !transports[name]) {
		config.http.serversTransports = { ...transports, [name]: VIP_TRANSPORT };
		changed = true;
	} else if (!used && transports[name]) {
		delete transports[name];
		if (Object.keys(transports).length === 0) {
			delete config.http.serversTransports;
		}
		changed = true;
	}
	return changed;
};

/** Brings domains written before the transport existed onto it. */
export const ensureApplicationTransport = (
	appName: string,
	serverId: string | null | undefined,
) =>
	withTraefikConfigLock(appName, serverId, async () => {
		const config = serverId
			? await loadOrCreateConfigRemote(serverId, appName)
			: loadOrCreateConfig(appName);
		if (!setApplicationTransport(config, appName)) return false;
		if (serverId) {
			await writeTraefikConfigRemote(config, appName, serverId);
		} else {
			writeTraefikConfig(config, appName);
		}
		return true;
	});

/** Labels can't define a transport, so stacks share one from a file. */
export const getWriteStackTransportCommand = (serverId: string | null) => {
	const { DYNAMIC_TRAEFIK_PATH } = paths(!!serverId);
	const file = path.join(DYNAMIC_TRAEFIK_PATH, STACK_TRANSPORT_FILE);
	const content = stringify({
		http: { serversTransports: { [STACK_TRANSPORT]: VIP_TRANSPORT } },
	});
	return `mkdir -p ${quote([DYNAMIC_TRAEFIK_PATH])} && { [ "$(cat ${quote([file])} 2>/dev/null)" = ${quote([content.trimEnd()])} ] || printf '%s\\n' ${quote([content.trimEnd()])} > ${quote([file])}; }`;
};
