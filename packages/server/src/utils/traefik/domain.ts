import type { Domain } from "@dokploy/server/services/domain";
import type { ApplicationNested } from "../builders";
import type { ComposeNested } from "../builders/compose";
import {
	createServiceConfig,
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	removeTraefikConfig,
	removeTraefikConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig, HttpLoadBalancerService, HttpRouter } from "./file-types";
import { createPathMiddlewares, removePathMiddlewares } from "./middleware";

export const manageDomain = async (app: ApplicationNested, domain: Domain) => {
	const { appName } = app;
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

	const { host, path, https, uniqueConfigKey, internalPath, stripPath } =
		domain;
	const routerConfig: HttpRouter = {
		rule: `Host(\`${host}\`)${path !== null && path !== "/" ? ` && PathPrefix(\`${path}\`)` : ""}`,
		service: `${appName}-service-${uniqueConfigKey}`,
		middlewares: [],
		entryPoints: [entryPoint],
	};

	// Add path rewriting middleware if needed
	if (internalPath && internalPath !== "/" && internalPath !== path) {
		const pathMiddleware = `addprefix-${appName}-${uniqueConfigKey}`;
		routerConfig.middlewares?.push(pathMiddleware);
	}

	if (stripPath && path && path !== "/") {
		const stripMiddleware = `stripprefix-${appName}-${uniqueConfigKey}`;
		routerConfig.middlewares?.push(stripMiddleware);
	}

	if (entryPoint === "web" && https) {
		routerConfig.middlewares = ["redirect-to-https"];
	}

	if ((entryPoint === "websecure" && https) || !https) {
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
	}

	if (entryPoint === "websecure") {
		if (certificateType === "letsencrypt") {
			routerConfig.tls = { certResolver: "letsencrypt" };
		} else if (certificateType === "custom" && domain.customCertResolver) {
			routerConfig.tls = { certResolver: domain.customCertResolver };
		} else if (certificateType === "none") {
			routerConfig.tls = undefined;
		}
	}

	return routerConfig;
};

/**
 * Manage Traefik domain configuration for Compose services
 * Creates/updates Traefik file-based configuration for compose service domains
 */
export const manageDomainForCompose = async (
	compose: ComposeNested,
	domain: Domain,
) => {
	const { appName, serverId } = compose;
	
	if (!domain.serviceName) {
		throw new Error("Service name is required for compose domains");
	}

	let config: FileConfig;

	if (serverId) {
		config = await loadOrCreateConfigRemote(serverId, appName);
	} else {
		config = loadOrCreateConfig(appName);
	}

	const serviceName = `${appName}-service-${domain.uniqueConfigKey}`;
	const routerName = `${appName}-router-${domain.uniqueConfigKey}`;
	const routerNameSecure = `${appName}-router-websecure-${domain.uniqueConfigKey}`;

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};
	config.http.services = config.http.services || {};

	config.http.routers[routerName] = await createRouterConfigForCompose(
		compose,
		domain,
		"web",
	);

	if (domain.https) {
		config.http.routers[routerNameSecure] = await createRouterConfigForCompose(
			compose,
			domain,
			"websecure",
		);
	} else {
		delete config.http.routers[routerNameSecure];
	}

	config.http.services[serviceName] = createServiceConfigForCompose(
		compose,
		domain,
	);

	await createPathMiddlewaresForCompose(compose, domain);

	if (serverId) {
		await writeTraefikConfigRemote(config, appName, serverId);
	} else {
		writeTraefikConfig(config, appName);
	}
};

/**
 * Remove domain configuration for Compose services
 */
export const removeDomainForCompose = async (
	compose: ComposeNested,
	uniqueKey: number,
) => {
	const { appName, serverId } = compose;
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

	await removePathMiddlewaresForCompose(compose, uniqueKey);

	// Verify if is the last router, if so delete the file
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

/**
 * Create router configuration for Compose services
 * Simplified version without application-specific features (redirects, security)
 */
export const createRouterConfigForCompose = async (
	compose: ComposeNested,
	domain: Domain,
	entryPoint: "web" | "websecure",
): Promise<HttpRouter> => {
	const { appName } = compose;
	const { certificateType, host, path, https, uniqueConfigKey, internalPath, stripPath } =
		domain;

	const routerConfig: HttpRouter = {
		rule: `Host(\`${host}\`)${path !== null && path !== "/" ? ` && PathPrefix(\`${path}\`)` : ""}`,
		service: `${appName}-service-${uniqueConfigKey}`,
		middlewares: [],
		entryPoints: [entryPoint],
	};

	// Add path rewriting middleware if needed
	if (internalPath && internalPath !== "/" && internalPath !== path) {
		const pathMiddleware = `addprefix-${appName}-${uniqueConfigKey}`;
		routerConfig.middlewares?.push(pathMiddleware);
	}

	if (stripPath && path && path !== "/") {
		const stripMiddleware = `stripprefix-${appName}-${uniqueConfigKey}`;
		routerConfig.middlewares?.push(stripMiddleware);
	}

	if (entryPoint === "web" && https) {
		routerConfig.middlewares = ["redirect-to-https"];
	}

	if (entryPoint === "websecure") {
		if (certificateType === "letsencrypt") {
			routerConfig.tls = { certResolver: "letsencrypt" };
		} else if (certificateType === "custom" && domain.customCertResolver) {
			routerConfig.tls = { certResolver: domain.customCertResolver };
		} else if (certificateType === "none") {
			routerConfig.tls = undefined;
		}
	}

	return routerConfig;
};

/**
 * Create service configuration for Compose services
 * Uses container name pattern based on compose type
 */
export const createServiceConfigForCompose = (
	compose: ComposeNested,
	domain: Domain,
): {
	loadBalancer: HttpLoadBalancerService;
} => {
	const { appName, composeType } = compose;
	const { serviceName, port } = domain;

	if (!serviceName) {
		throw new Error("Service name is required for compose domains");
	}

	// Determine container/service name based on compose type
	// For docker-compose: containers are named like {appName}-{serviceName}-1
	// For stack: containers are named like {appName}_{serviceName}.{number}.{taskId}
	// In the same network, we can use the service name, but to be safe we use container name pattern
	let containerServiceName: string;
	if (composeType === "stack") {
		// For stacks, use the service name pattern
		containerServiceName = `${appName}_${serviceName}`;
	} else {
		// For docker-compose, use the container name pattern (first instance)
		containerServiceName = `${appName}-${serviceName}-1`;
	}

	return {
		loadBalancer: {
			servers: [{ url: `http://${containerServiceName}:${port || 80}` }],
			passHostHeader: true,
		},
	};
};

/**
 * Create path middlewares for Compose services
 * Reuses the same middleware creation logic as applications
 */
const createPathMiddlewaresForCompose = async (
	compose: ComposeNested,
	domain: Domain,
) => {
	// Reuse the same middleware creation logic
	// We need to create a minimal ApplicationNested-like object
	const appLike = {
		appName: compose.appName,
		serverId: compose.serverId,
	} as ApplicationNested;
	await createPathMiddlewares(appLike, domain);
};

/**
 * Remove path middlewares for Compose services
 */
const removePathMiddlewaresForCompose = async (
	compose: ComposeNested,
	uniqueKey: number,
) => {
	// Reuse the same middleware removal logic
	const appLike = {
		appName: compose.appName,
		serverId: compose.serverId,
	} as ApplicationNested;
	await removePathMiddlewares(appLike, uniqueKey);
};
