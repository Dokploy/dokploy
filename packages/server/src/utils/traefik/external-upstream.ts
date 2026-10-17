import type { Domain } from "@dokploy/server/services/domain";
import type { ExternalUpstream } from "@dokploy/server/services/external-upstream";
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
): {
	loadBalancer: {
		servers: [{ url: string }];
		passHostHeader: boolean;
	};
} => ({
	loadBalancer: {
		servers: [{ url: service.targetUrl }],
		passHostHeader: service.passHostHeader,
	},
});

export const manageExternalUpstreamDomain = async (
	service: ExternalUpstreamTraefikTarget,
	domain: Domain,
) => {
	let config: FileConfig;

	if (service.serverId) {
		config = await loadOrCreateConfigRemote(service.serverId, service.appName);
	} else {
		config = loadOrCreateConfig(service.appName);
	}

	const serviceName = `${service.appName}-service-${domain.uniqueConfigKey}`;
	const routerName = `${service.appName}-router-${domain.uniqueConfigKey}`;
	const routerNameSecure = `${service.appName}-router-websecure-${domain.uniqueConfigKey}`;

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

	config.http.services[serviceName] = createServiceConfig(service);

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

	if (config.http?.routers?.[routerKey]) {
		delete config.http.routers[routerKey];
	}
	if (config.http?.routers?.[routerSecureKey]) {
		delete config.http.routers[routerSecureKey];
	}
	if (config.http?.services?.[serviceKey]) {
		delete config.http.services[serviceKey];
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
