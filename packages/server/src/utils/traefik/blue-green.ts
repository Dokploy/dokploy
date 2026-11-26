import {
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	withTraefikConfigLock,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig } from "./file-types";

export const greenServiceName = (appName: string) => `${appName}-green`;

const escapeRegExp = (value: string) =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Re-targets the application's domains to one of its two Swarm services: the
 * service itself, or its temporary green twin. Only the host of each server
 * URL changes, so routers, middlewares and the transport stay as they are.
 */
export const pointDomainsAt = (
	config: FileConfig,
	appName: string,
	target: string,
) => {
	const host = new RegExp(
		`^([a-z][a-z0-9+.-]*://)(?:${escapeRegExp(appName)}|${escapeRegExp(greenServiceName(appName))})(?=[:/]|$)`,
		"i",
	);
	let changed = false;
	for (const [key, service] of Object.entries(config.http?.services ?? {})) {
		if (!key.startsWith(`${appName}-service-`) || !("loadBalancer" in service))
			continue;
		for (const server of service.loadBalancer?.servers ?? []) {
			const url = server.url.replace(host, `$1${target}`);
			if (url !== server.url) {
				server.url = url;
				changed = true;
			}
		}
	}
	return changed;
};

export const switchApplicationTraffic = (
	appName: string,
	serverId: string | null | undefined,
	target: string,
) =>
	withTraefikConfigLock(appName, serverId, async () => {
		const config = serverId
			? await loadOrCreateConfigRemote(serverId, appName)
			: loadOrCreateConfig(appName);
		if (!pointDomainsAt(config, appName, target)) return false;
		if (serverId) {
			await writeTraefikConfigRemote(config, appName, serverId);
		} else {
			writeTraefikConfig(config, appName);
		}
		return true;
	});
