import type { Proxy } from "@dokploy/server/services/proxy";
import { wildcardToHostRegexp } from "@dokploy/server/utils/domain/wildcard";
import {
	loadOrCreateConfig,
	loadOrCreateConfigRemote,
	removeTraefikConfig,
	removeTraefikConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig, HttpLoadBalancerService, HttpRouter } from "./file-types";

export const manageProxyDomain = async (proxy: Proxy) => {
	const proxyName = `proxy-${proxy.proxyId}`;
	let config: FileConfig;

	if (proxy.serverId) {
		config = await loadOrCreateConfigRemote(proxy.serverId, proxyName);
	} else {
		config = loadOrCreateConfig(proxyName);
	}

	const routerName = `${proxyName}-router`;
	const routerNameSecure = `${proxyName}-router-websecure`;
	const serviceName = `${proxyName}-service`;

	config.http = config.http || { routers: {}, services: {} };
	config.http.routers = config.http.routers || {};
	config.http.services = config.http.services || {};

	// Create middlewares if needed
	config.http.middlewares = config.http.middlewares || {};
	
	if (proxy.stripPath && proxy.path && proxy.path !== "/") {
		const stripMiddleware = `stripprefix-proxy-${proxy.proxyId}`;
		config.http.middlewares[stripMiddleware] = {
			stripPrefix: {
				prefixes: [proxy.path],
				forceSlash: false,
			},
		};
	}
	
	if (proxy.internalPath && proxy.internalPath !== "/" && proxy.internalPath !== proxy.path) {
		const addPrefixMiddleware = `addprefix-proxy-${proxy.proxyId}`;
		config.http.middlewares[addPrefixMiddleware] = {
			addPrefix: {
				prefix: proxy.internalPath,
			},
		};
	}

	// Create HTTP router (web entrypoint)
	config.http.routers[routerName] = createProxyRouter(proxy, "web");

	// Create HTTPS router if HTTPS is enabled
	if (proxy.https) {
		config.http.routers[routerNameSecure] = createProxyRouter(proxy, "websecure");
	} else {
		delete config.http.routers[routerNameSecure];
	}

	// Create service
	config.http.services[serviceName] = await createProxyService(proxy);

	// Write configuration
	if (proxy.serverId) {
		await writeTraefikConfigRemote(config, proxyName, proxy.serverId);
	} else {
		writeTraefikConfig(config, proxyName);
	}
};

export const removeProxyDomain = async (proxy: Proxy) => {
	const proxyName = `proxy-${proxy.proxyId}`;
	let config: FileConfig;

	if (proxy.serverId) {
		config = await loadOrCreateConfigRemote(proxy.serverId, proxyName);
	} else {
		config = loadOrCreateConfig(proxyName);
	}

	const routerName = `${proxyName}-router`;
	const routerNameSecure = `${proxyName}-router-websecure`;
	const serviceName = `${proxyName}-service`;
	const stripMiddleware = `stripprefix-proxy-${proxy.proxyId}`;
	const addPrefixMiddleware = `addprefix-proxy-${proxy.proxyId}`;

	// Remove routers and service
	if (config.http?.routers?.[routerName]) {
		delete config.http.routers[routerName];
	}
	if (config.http?.routers?.[routerNameSecure]) {
		delete config.http.routers[routerNameSecure];
	}
	if (config.http?.services?.[serviceName]) {
		delete config.http.services[serviceName];
	}
	
	// Remove middlewares
	if (config.http?.middlewares?.[stripMiddleware]) {
		delete config.http.middlewares[stripMiddleware];
	}
	if (config.http?.middlewares?.[addPrefixMiddleware]) {
		delete config.http.middlewares[addPrefixMiddleware];
	}

	// If no routers left, remove the entire config file
	if (
		config?.http?.routers &&
		Object.keys(config.http.routers).length === 0
	) {
		if (proxy.serverId) {
			await removeTraefikConfigRemote(proxyName, proxy.serverId);
		} else {
			await removeTraefikConfig(proxyName);
		}
	} else {
		// Write updated configuration
		if (proxy.serverId) {
			await writeTraefikConfigRemote(config, proxyName, proxy.serverId);
		} else {
			writeTraefikConfig(config, proxyName);
		}
	}
};

export const createProxyRouter = (
	proxy: Proxy,
	entryPoint: "web" | "websecure",
): HttpRouter => {
	// Generate host rule with wildcard support
	let hostRule: string;
	if (proxy.isWildcard && proxy.host.startsWith("*.")) {
		hostRule = wildcardToHostRegexp(proxy.host);
	} else {
		hostRule = `Host(\`${proxy.host}\`)`;
	}

	// Add path prefix if specified
	const pathRule =
		proxy.path && proxy.path !== "/" ? ` && PathPrefix(\`${proxy.path}\`)` : "";

	const routerConfig: HttpRouter = {
		rule: `${hostRule}${pathRule}`,
		service: `proxy-${proxy.proxyId}-service`,
		middlewares: [],
		entryPoints: [entryPoint],
		priority: proxy.priority || undefined,
	};

	// Add HTTPS redirect for web entrypoint (must be first)
	if (entryPoint === "web" && proxy.https) {
		routerConfig.middlewares = ["redirect-to-https"];
	} else {
		// Add path stripping middleware if needed
		if (proxy.stripPath && proxy.path && proxy.path !== "/") {
			const stripMiddleware = `stripprefix-proxy-${proxy.proxyId}`;
			routerConfig.middlewares?.push(stripMiddleware);
		}

		// Add internal path prefix middleware if needed
		if (proxy.internalPath && proxy.internalPath !== "/" && proxy.internalPath !== proxy.path) {
			const addPrefixMiddleware = `addprefix-proxy-${proxy.proxyId}`;
			routerConfig.middlewares?.push(addPrefixMiddleware);
		}
	}

	// Add TLS configuration for websecure entrypoint
	if (entryPoint === "websecure" && proxy.https) {
		if (proxy.certificateType === "letsencrypt") {
			routerConfig.tls = { certResolver: "letsencrypt" };
		} else if (proxy.certificateType === "custom" && proxy.customCertResolver) {
			routerConfig.tls = { certResolver: proxy.customCertResolver };
		} else if (proxy.certificateId) {
			// Use certificate store if certificate ID is provided
			routerConfig.tls = { certResolver: undefined };
		}
	}

	return routerConfig;
};

export const createProxyService = async (proxy: Proxy): Promise<HttpLoadBalancerService> => {
	// Determine target URL
	let targetUrl: string;

	if (proxy.targetType === "url" && proxy.targetUrl) {
		targetUrl = proxy.targetUrl;
	} else if (proxy.targetType === "application" && proxy.targetId) {
		// For applications, fetch the appName from the database
		const { db } = await import("@dokploy/server/db");
		const { applications } = await import("@dokploy/server/db/schema");
		const { eq } = await import("drizzle-orm");
		
		const app = await db.query.applications.findFirst({
			where: eq(applications.applicationId, proxy.targetId),
		});
		
		if (app?.appName) {
			targetUrl = `http://${app.appName}:${proxy.port || 3000}`;
		} else {
			// Fallback if app not found
			targetUrl = `http://${proxy.targetId}:${proxy.port || 3000}`;
		}
	} else if (proxy.targetType === "compose" && proxy.targetId) {
		// For compose services, fetch the appName from the database
		const { db } = await import("@dokploy/server/db");
		const { compose } = await import("@dokploy/server/db/schema");
		const { eq } = await import("drizzle-orm");
		
		const composeApp = await db.query.compose.findFirst({
			where: eq(compose.composeId, proxy.targetId),
		});
		
		if (composeApp?.appName) {
			targetUrl = `http://${composeApp.appName}:${proxy.port || 3000}`;
		} else {
			// Fallback if compose not found
			targetUrl = `http://${proxy.targetId}:${proxy.port || 3000}`;
		}
	} else if (proxy.targetType === "service" && proxy.targetId) {
		// For services, use the service name directly
		targetUrl = `http://${proxy.targetId}:${proxy.port || 3000}`;
	} else {
		// Fallback to targetUrl or default
		targetUrl = proxy.targetUrl || `http://localhost:${proxy.port || 3000}`;
	}

	return {
		loadBalancer: {
			servers: [{ url: targetUrl }],
			passHostHeader: true,
		},
	};
};

