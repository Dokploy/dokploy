import type { Domain } from "@dokploy/server/services/domain";
import type { ExternalUpstream } from "@dokploy/server/services/external-upstream";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import {
	DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
	resolveExternalUpstreamTarget,
} from "@dokploy/server/utils/network/external-upstream";
import {
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	removeTraefikConfig,
	removeTraefikConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig, HttpRouter } from "./file-types";
import { createPathMiddlewares, removePathMiddlewares } from "./middleware";

type ExternalUpstreamTraefikTarget = Pick<
	ExternalUpstream,
	"appName" | "serverId" | "targetUrl" | "passHostHeader"
>;

const toPunycode = (host: string): string => {
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
};

const createRouterConfig = (
	service: ExternalUpstreamTraefikTarget,
	domain: Domain,
	entryPoint: string,
) => {
	const punycodeHost = toPunycode(domain.host);
	const routerConfig: HttpRouter = {
		rule: `Host(\`${punycodeHost}\`)${domain.path !== null && domain.path !== "/" ? ` && PathPrefix(\`${domain.path}\`)` : ""}`,
		service: `${service.appName}-service-${domain.uniqueConfigKey}`,
		middlewares: [],
		entryPoints: [entryPoint],
	};

	const isRedirectRouter =
		entryPoint === "web" && domain.https && !domain.customEntrypoint;

	if (isRedirectRouter) {
		routerConfig.middlewares?.push("redirect-to-https");
	} else {
		if (domain.stripPath && domain.path && domain.path !== "/") {
			routerConfig.middlewares?.push(
				`stripprefix-${service.appName}-${domain.uniqueConfigKey}`,
			);
		}

		if (
			domain.internalPath &&
			domain.internalPath !== "/" &&
			domain.internalPath !== domain.path
		) {
			routerConfig.middlewares?.push(
				`addprefix-${service.appName}-${domain.uniqueConfigKey}`,
			);
		}

		if (domain.middlewares && domain.middlewares.length > 0) {
			routerConfig.middlewares?.push(...domain.middlewares);
		}
	}

	if (entryPoint === "websecure" || (domain.customEntrypoint && domain.https)) {
		if (domain.certificateType === "letsencrypt") {
			routerConfig.tls = { certResolver: "letsencrypt" };
		} else if (
			domain.certificateType === "custom" &&
			domain.customCertResolver
		) {
			routerConfig.tls = { certResolver: domain.customCertResolver };
		} else if (domain.certificateType === "none") {
			routerConfig.tls = undefined;
		}
	}

	return routerConfig;
};

const createServiceConfig = (
	service: ExternalUpstreamTraefikTarget,
	urls: string[],
	serversTransport: string | undefined,
): {
	loadBalancer: {
		servers: [{ url: string }, ...{ url: string }[]];
		passHostHeader: boolean;
		serversTransport?: string;
	};
} => {
	const [firstUrl, ...remainingUrls] = urls;
	if (!firstUrl) {
		throw new Error("Target URL hostname could not be resolved");
	}

	return {
		loadBalancer: {
			servers: [{ url: firstUrl }, ...remainingUrls.map((url) => ({ url }))],
			passHostHeader: service.passHostHeader,
			...(serversTransport ? { serversTransport } : {}),
		},
	};
};

export const manageExternalUpstreamDomain = async (
	service: ExternalUpstreamTraefikTarget,
	domain: Domain,
) => {
	if (!domain.enabled) {
		await removeExternalUpstreamDomain(service, domain.uniqueConfigKey);
		return;
	}

	const settings = await getWebServerSettings();
	const resolvedTarget = await resolveExternalUpstreamTarget({
		targetUrl: service.targetUrl,
		blockedCidrs:
			settings?.externalUpstreamBlockedCidrs ??
			DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
	});
	let config: FileConfig;

	if (service.serverId) {
		config = await loadOrCreateConfigRemote(service.serverId, service.appName);
	} else {
		config = loadOrCreateConfig(service.appName);
	}

	const serviceName = `${service.appName}-service-${domain.uniqueConfigKey}`;
	const routerName = `${service.appName}-router-${domain.uniqueConfigKey}`;
	const routerNameSecure = `${service.appName}-router-websecure-${domain.uniqueConfigKey}`;
	const hostHeaderMiddleware = `${service.appName}-host-header-${domain.uniqueConfigKey}`;
	const serversTransport = `${service.appName}-servers-transport-${domain.uniqueConfigKey}`;

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};
	config.http.services = config.http.services || {};

	config.http.routers[routerName] = createRouterConfig(
		service,
		domain,
		domain.customEntrypoint || "web",
	);
	if (!domain.customEntrypoint && domain.https) {
		config.http.routers[routerNameSecure] = createRouterConfig(
			service,
			domain,
			"websecure",
		);
	} else {
		delete config.http.routers[routerNameSecure];
	}

	const hasHttpRedirect = !domain.customEntrypoint && domain.https;
	const upstreamRouters = [
		{
			router: config.http.routers[routerName],
			active: !hasHttpRedirect,
		},
		{
			router: config.http.routers[routerNameSecure],
			active: Boolean(config.http.routers[routerNameSecure]),
		},
	];
	const activeUpstreamRouters = upstreamRouters.filter(
		({ router, active }) => router && active,
	);

	if (!service.passHostHeader && activeUpstreamRouters.length > 0) {
		config.http.middlewares = config.http.middlewares || {};
		config.http.middlewares[hostHeaderMiddleware] = {
			headers: { customRequestHeaders: { Host: resolvedTarget.hostHeader } },
		};
	} else {
		delete config.http.middlewares?.[hostHeaderMiddleware];
	}

	for (const { router, active } of upstreamRouters) {
		if (!router) {
			continue;
		}

		if (!service.passHostHeader && active) {
			if (!router.middlewares?.includes(hostHeaderMiddleware)) {
				router.middlewares?.push(hostHeaderMiddleware);
			}
		} else if (router.middlewares) {
			router.middlewares = router.middlewares.filter(
				(middleware) => middleware !== hostHeaderMiddleware,
			);
		}
	}

	const hasHttpsTarget = new URL(service.targetUrl).protocol === "https:";
	if (hasHttpsTarget && resolvedTarget.serverName) {
		config.http.serversTransports = config.http.serversTransports || {};
		config.http.serversTransports[serversTransport] = {
			serverName: resolvedTarget.serverName,
		};
	} else {
		delete config.http.serversTransports?.[serversTransport];
	}

	config.http.services[serviceName] = createServiceConfig(
		service,
		resolvedTarget.urls,
		hasHttpsTarget && resolvedTarget.serverName ? serversTransport : undefined,
	);

	await createPathMiddlewares(
		{
			appName: service.appName,
			serverId: service.serverId,
		} as never,
		domain,
	);

	if (service.serverId) {
		await writeTraefikConfigRemote(config, service.appName, service.serverId);
	} else {
		writeTraefikConfig(config, service.appName);
	}
};

export const removeExternalUpstreamDomain = async (
	service: ExternalUpstreamTraefikTarget,
	uniqueConfigKey: number,
) => {
	let config: FileConfig;

	if (service.serverId) {
		config = await loadOrCreateConfigRemote(service.serverId, service.appName);
	} else {
		config = loadOrCreateConfig(service.appName);
	}

	const routerKey = `${service.appName}-router-${uniqueConfigKey}`;
	const routerSecureKey = `${service.appName}-router-websecure-${uniqueConfigKey}`;
	const serviceKey = `${service.appName}-service-${uniqueConfigKey}`;
	const hostHeaderMiddleware = `${service.appName}-host-header-${uniqueConfigKey}`;
	const serversTransport = `${service.appName}-servers-transport-${uniqueConfigKey}`;

	if (config.http?.routers?.[routerKey]) {
		delete config.http.routers[routerKey];
	}
	if (config.http?.routers?.[routerSecureKey]) {
		delete config.http.routers[routerSecureKey];
	}
	if (config.http?.services?.[serviceKey]) {
		delete config.http.services[serviceKey];
	}
	if (config.http?.middlewares?.[hostHeaderMiddleware]) {
		delete config.http.middlewares[hostHeaderMiddleware];
	}
	if (config.http?.serversTransports?.[serversTransport]) {
		delete config.http.serversTransports[serversTransport];
	}

	await removePathMiddlewares(
		{
			appName: service.appName,
			serverId: service.serverId,
		} as never,
		uniqueConfigKey,
	);

	if (config.http?.routers && Object.keys(config.http.routers).length === 0) {
		if (service.serverId) {
			await removeTraefikConfigRemote(service.appName, service.serverId);
		} else {
			await removeTraefikConfig(service.appName);
		}
	} else if (service.serverId) {
		await writeTraefikConfigRemote(config, service.appName, service.serverId);
	} else {
		writeTraefikConfig(config, service.appName);
	}
};
