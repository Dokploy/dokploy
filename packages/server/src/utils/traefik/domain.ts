import type { Domain } from "@dokploy/server/services/domain";
import type { ApplicationNested } from "../builders";
import {
	createServiceConfig,
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	removeTraefikConfig,
	removeTraefikConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig, HttpRouter } from "./file-types";
import {
	createForwardAuthMiddleware,
	forwardAuthMiddlewareName,
	removeForwardAuthMiddleware,
} from "./forward-auth";
import { createPathMiddlewares, removePathMiddlewares } from "./middleware";
import { isWildcardDomain } from "../../utils/wildcard-domain";

export const manageDomain = async (app: ApplicationNested, domain: Domain) => {
	const { appName } = app;

	// A disabled domain keeps its configuration in the database but must never
	// expose a traefik router. Guarding here covers every caller (create, update,
	// forward-auth, toggle) so a disabled domain can't be revived from any path.
	if (!domain.enabled) {
		await removeDomain(app, domain.uniqueConfigKey);
		return;
	}

	let config: FileConfig;

	if (app.serverId) {
		config = await loadOrCreateConfigRemote(app.serverId, appName);
	} else {
		config = loadOrCreateConfig(appName);
	}
	const serviceName = `${appName}-service-${domain.uniqueConfigKey}`;
	const routerName = `${appName}-router-${domain.uniqueConfigKey}`;
	const routerNameSecure = `${appName}-router-websecure-${domain.uniqueConfigKey}`;

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};
	config.http.services = config.http.services || {};

	config.http.routers[routerName] = await createRouterConfig(
		app,
		domain,
		"web",
	);

	if (domain.https) {
		config.http.routers[routerNameSecure] = await createRouterConfig(
			app,
			domain,
			"websecure",
		);
	} else {
		delete config.http.routers[routerNameSecure];
	}

	config.http.services[serviceName] = createServiceConfig(appName, domain);

	await createPathMiddlewares(app, domain);
	// SSO forward-auth: writes the per-app forwardAuth + errors middlewares (the
	// /oauth2/* router lives on the central auth domain, not here). No-op unless
	// the domain links a provider and the org has an auth domain configured.
	await createForwardAuthMiddleware(app, domain);

	if (app.serverId) {
		await writeTraefikConfigRemote(config, appName, app.serverId);
	} else {
		writeTraefikConfig(config, appName);
	}
};

export const removeDomain = async (
	application: ApplicationNested,
	uniqueKey: number,
) => {
	const { appName, serverId } = application;
	let config: FileConfig;

	if (serverId) {
		config = await loadOrCreateConfigRemote(serverId, appName);
	} else {
		config = loadOrCreateConfig(appName);
	}

	const routerKey = `${appName}-router-${uniqueKey}`;
	const routerSecureKey = `${appName}-router-websecure-${uniqueKey}`;

	const serviceKey = `${appName}-service-${uniqueKey}`;
	if (config.http?.routers?.[routerKey]) {
		delete config.http.routers[routerKey];
	}
	if (config.http?.routers?.[routerSecureKey]) {
		delete config.http.routers[routerSecureKey];
	}
	if (config.http?.services?.[serviceKey]) {
		delete config.http.services[serviceKey];
	}

	await removePathMiddlewares(application, uniqueKey);
	await removeForwardAuthMiddleware(application, uniqueKey);

	// verify if is the last router if so we delete the router
	if (
		config?.http?.routers &&
		Object.keys(config?.http?.routers).length === 0
	) {
		if (serverId) {
			await removeTraefikConfigRemote(appName, serverId);
		} else {
			await removeTraefikConfig(appName);
		}
	} else {
		if (serverId) {
			await writeTraefikConfigRemote(config, appName, serverId);
		} else {
			writeTraefikConfig(config, appName);
		}
	}
};

export const createRouterConfig = async (
	app: ApplicationNested,
	domain: Domain,
	entryPoint: "web" | "websecure",
) => {
	const { appName, redirects, security } = app;
	const { certificateType } = domain;

	const {
		host,
		path,
		https,
		uniqueConfigKey,
		internalPath,
		stripPath,
		customEntrypoint,
	} = domain;

	const isWildcard = isWildcardDomain(host);
	const hostRule = isWildcard
		? `HostRegexp(\`${host.replace("*.", "{subdomain:[a-zA-Z0-9-]+}.")}\`)`
		: `Host(\`${toPunycode(host)}\`)`;

	const routerConfig: HttpRouter = {
		rule: `${hostRule}${path !== null && path !== "/" ? ` && PathPrefix(\`${path}\`)` : ""}`,
		service: `${appName}-service-${uniqueConfigKey}`,
		middlewares: [],
		entryPoints: [entryPoint],
	};

	const isRedirectRouter = entryPoint === "web" && https && !customEntrypoint;

	if (isRedirectRouter) {
		routerConfig.middlewares?.push("redirect-to-https");
	} else {
		if (stripPath && path && path !== "/") {
			const stripMiddleware = `stripprefix-${appName}-${uniqueConfigKey}`;
			routerConfig.middlewares?.push(stripMiddleware);
		}

		if (internalPath && internalPath !== "/" && internalPath !== path) {
			const pathMiddleware = `addprefix-${appName}-${uniqueConfigKey}`;
			routerConfig.middlewares?.push(pathMiddleware);
		}

		// redirects
		for (const redirect of redirects) {
			let middlewareName = `redirect-${appName}-${redirect.uniqueConfigKey}`;
			if (domain.domainType === "preview") {
				middlewareName = `redirect-${appName.replace(
					/^preview-(.+)-[^-]+$/,
					"$1",
				)}-${redirect.uniqueConfigKey}`;
			}
			routerConfig.middlewares?.push(middlewareName);
		}

		// security
		if (security.length > 0) {
			let middlewareName = `auth-${appName}`;
			if (domain.domainType === "preview") {
				middlewareName = `auth-${appName.replace(
					/^preview-(.+)-[^-]+$/,
					"$1",
				)}`;
			}
			routerConfig.middlewares?.push(middlewareName);
		}

		// Enterprise SSO forward-auth gate. Placed before custom middlewares so
		// authentication runs first. No-op unless the domain links a provider.
		// The -errors middleware must come first so a 401 from the auth check is
		// rewritten to a 302 redirect to the login page.
		if (domain.forwardAuthEnabled) {
			const name = forwardAuthMiddlewareName(appName, uniqueConfigKey);
			routerConfig.middlewares?.push(`${name}-errors`);
			routerConfig.middlewares?.push(name);
		}

		// custom middlewares from domain
		if (domain.middlewares && domain.middlewares.length > 0) {
			routerConfig.middlewares?.push(...domain.middlewares);
		}
	}

	if (entryPoint === "websecure" || (customEntrypoint && https)) {
		if (certificateType === "letsencrypt") {
			if (isWildcard) {
				routerConfig.tls = {
					certResolver: "letsencrypt-dns-cloudflare-0",
					domains: [{ main: host, sans: [] }],
				};
			} else {
				routerConfig.tls = { certResolver: "letsencrypt" };
			}
		} else if (certificateType === "custom" && domain.customCertResolver) {
			routerConfig.tls = { certResolver: domain.customCertResolver };
		} else if (certificateType === "none") {
			routerConfig.tls = undefined;
		}
	}

	return routerConfig;
};
