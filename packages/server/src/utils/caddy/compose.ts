import type { Compose } from "@dokploy/server/services/compose";
import type { Domain } from "@dokploy/server/services/domain";
import { getCaddyCompileSettings } from "@dokploy/server/services/web-server-settings";
import {
	compileWriteAndReloadCaddyConfigSafely,
	readCaddyRouteFragments,
	removeCaddyRouteFragment,
	restoreCaddyRouteFragments,
	writeCaddyRouteFragment,
} from "./config";
import {
	assertCaddyDomainCertificateAvailable,
	assertCaddyDomainSupported,
	getCaddyCustomCertificateFiles,
} from "./domain";
import type { CaddyRouteFragment, CaddyRouteIntent } from "./types";
import { getCaddyComposeRuntimeTarget } from "./upstream-targets";

const CADDY_FRAGMENT_VERSION = 1;

const toPunycode = (host: string): string => {
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
};

export const getCaddyComposeFragmentPrefix = (appName: string) =>
	`compose.${appName}.`;

export const getCaddyComposeFragmentId = (
	appName: string,
	uniqueConfigKey: number,
) => `${getCaddyComposeFragmentPrefix(appName)}${uniqueConfigKey}`;

const createCaddyRouteId = (appName: string, uniqueConfigKey: number) =>
	`${appName}-compose-route-${uniqueConfigKey}`;

export const createCaddyComposeRouteIntent = (
	compose: Pick<
		Compose,
		"appName" | "composeType" | "isolatedDeployment" | "serverId"
	>,
	domain: Domain,
	finalServiceName: string,
	options: {
		upstreamServiceName?: string;
		upstreamNetwork?: string | null;
	} = {},
): CaddyRouteIntent => {
	assertCaddyDomainSupported(domain);
	const publicPath = domain.path && domain.path !== "/" ? domain.path : null;
	const internalPath =
		domain.internalPath &&
		domain.internalPath !== "/" &&
		domain.internalPath !== domain.path
			? domain.internalPath
			: null;
	const runtimeTarget = getCaddyComposeRuntimeTarget(compose, finalServiceName);
	const upstreamServiceName = options.upstreamServiceName ?? runtimeTarget.host;
	const upstreamNetwork = options.upstreamNetwork ?? runtimeTarget.network;

	return {
		id: createCaddyRouteId(compose.appName, domain.uniqueConfigKey),
		source: "dokploy-compose",
		hosts: [toPunycode(domain.host)],
		pathPrefix: publicPath,
		https: domain.https && !domain.customEntrypoint,
		upstreams: [`http://${upstreamServiceName}:${domain.port || 80}`],
		upstreamNetwork,
		tlsCertificate:
			domain.https &&
			domain.certificateType === "custom" &&
			domain.customCertResolver
				? getCaddyCustomCertificateFiles(
						compose.serverId,
						domain.customCertResolver,
					)
				: null,
		transforms: {
			stripPrefix: domain.stripPath ? publicPath : null,
			addPrefix: internalPath,
		},
	};
};

export const createCaddyComposeRouteFragment = (
	compose: Pick<
		Compose,
		"appName" | "composeType" | "isolatedDeployment" | "serverId"
	>,
	domain: Domain,
	finalServiceName: string,
	options: {
		upstreamServiceName?: string;
		upstreamNetwork?: string | null;
	} = {},
): CaddyRouteFragment => ({
	version: CADDY_FRAGMENT_VERSION,
	id: getCaddyComposeFragmentId(compose.appName, domain.uniqueConfigKey),
	source: "dokploy-compose",
	description: `Dokploy compose route for ${compose.appName}:${domain.uniqueConfigKey}`,
	routes: [
		createCaddyComposeRouteIntent(compose, domain, finalServiceName, options),
	],
});

export const writeCaddyComposeRouteFragments = async (
	compose: Compose,
	domains: Array<{ domain: Domain; finalServiceName: string }>,
	options: {
		organizationId?: string | null;
	} = {},
) => {
	const serverId = compose.serverId || undefined;
	const organizationId =
		options.organizationId ??
		(
			compose as Compose & {
				environment?: { project?: { organizationId?: string | null } };
			}
		).environment?.project?.organizationId;
	for (const { domain } of domains) {
		await assertCaddyDomainCertificateAvailable(
			serverId,
			domain,
			organizationId,
		);
	}
	const routeFragmentOptions = { serverId };
	const fragmentPrefix = getCaddyComposeFragmentPrefix(compose.appName);
	const nextFragmentIds = new Set(
		domains.map(({ domain }) =>
			getCaddyComposeFragmentId(compose.appName, domain.uniqueConfigKey),
		),
	);
	let changed = false;

	const existingFragments = await readCaddyRouteFragments(routeFragmentOptions);
	try {
		for (const fragment of existingFragments) {
			if (
				fragment.source === "dokploy-compose" &&
				fragment.id.startsWith(fragmentPrefix) &&
				!nextFragmentIds.has(fragment.id)
			) {
				await removeCaddyRouteFragment(fragment.id, routeFragmentOptions);
				changed = true;
			}
		}

		for (const { domain, finalServiceName } of domains) {
			await writeCaddyRouteFragment(
				createCaddyComposeRouteFragment(compose, domain, finalServiceName),
				routeFragmentOptions,
			);
			changed = true;
		}

		if (!changed) {
			return;
		}

		await compileWriteAndReloadCaddyConfigSafely({
			serverId,
			...(await getCaddyCompileSettings(serverId)),
		});
	} catch (error) {
		await restoreCaddyRouteFragments(existingFragments, routeFragmentOptions);
		throw error;
	}
};
