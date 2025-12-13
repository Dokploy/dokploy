/**
 * Traefik Kubernetes CRD Utilities
 *
 * This module provides utilities for generating Traefik IngressRoute CRDs
 * for Kubernetes deployments.
 */

import type { CustomResource } from "../../services/orchestrator/types";

// =============================================================================
// Types
// =============================================================================

export interface TraefikIngressRouteConfig {
	name: string;
	namespace: string;
	domain: string;
	serviceName: string;
	servicePort: number;
	ssl?: boolean;
	certResolver?: string;
	middlewares?: string[];
	pathPrefix?: string;
	stripPrefix?: boolean;
	entryPoints?: string[];
	priority?: number;
}

export interface TraefikMiddlewareConfig {
	name: string;
	namespace: string;
	type:
		| "stripPrefix"
		| "redirectScheme"
		| "rateLimit"
		| "headers"
		| "compress"
		| "basicAuth"
		| "forwardAuth"
		| "retry";
	config: Record<string, unknown>;
}

export interface TraefikTLSOptionConfig {
	name: string;
	namespace: string;
	minVersion?: string;
	maxVersion?: string;
	cipherSuites?: string[];
	sniStrict?: boolean;
}

// =============================================================================
// IngressRoute Builders
// =============================================================================

/**
 * Build a Traefik IngressRoute CRD
 */
export function buildTraefikIngressRoute(
	config: TraefikIngressRouteConfig,
): CustomResource {
	const entryPoints = config.entryPoints || ["web", "websecure"];
	const routes = [
		{
			match: buildMatchRule(config.domain, config.pathPrefix),
			kind: "Rule",
			priority: config.priority,
			services: [
				{
					name: config.serviceName,
					port: config.servicePort,
				},
			],
			middlewares: config.middlewares?.map((m) => ({
				name: m,
				namespace: config.namespace,
			})),
		},
	];

	const ingressRoute: CustomResource = {
		apiVersion: "traefik.io/v1alpha1",
		kind: "IngressRoute",
		metadata: {
			name: config.name,
			namespace: config.namespace,
			labels: {
				"dokploy.managed": "true",
				"app.kubernetes.io/name": config.serviceName,
			},
		},
		spec: {
			entryPoints,
			routes,
			...(config.ssl && {
				tls: {
					certResolver: config.certResolver || "letsencrypt",
				},
			}),
		},
	};

	return ingressRoute;
}

/**
 * Build a Traefik IngressRouteTCP CRD for TCP services
 */
export function buildTraefikIngressRouteTCP(config: {
	name: string;
	namespace: string;
	entryPoints: string[];
	serviceName: string;
	servicePort: number;
	ssl?: boolean;
	sniHost?: string;
}): CustomResource {
	return {
		apiVersion: "traefik.io/v1alpha1",
		kind: "IngressRouteTCP",
		metadata: {
			name: config.name,
			namespace: config.namespace,
			labels: {
				"dokploy.managed": "true",
			},
		},
		spec: {
			entryPoints: config.entryPoints,
			routes: [
				{
					match: config.sniHost
						? `HostSNI(\`${config.sniHost}\`)`
						: "HostSNI(`*`)",
					services: [
						{
							name: config.serviceName,
							port: config.servicePort,
						},
					],
				},
			],
			...(config.ssl && {
				tls: {
					passthrough: false,
				},
			}),
		},
	};
}

/**
 * Build a Traefik IngressRouteUDP CRD for UDP services
 */
export function buildTraefikIngressRouteUDP(config: {
	name: string;
	namespace: string;
	entryPoints: string[];
	serviceName: string;
	servicePort: number;
}): CustomResource {
	return {
		apiVersion: "traefik.io/v1alpha1",
		kind: "IngressRouteUDP",
		metadata: {
			name: config.name,
			namespace: config.namespace,
			labels: {
				"dokploy.managed": "true",
			},
		},
		spec: {
			entryPoints: config.entryPoints,
			routes: [
				{
					services: [
						{
							name: config.serviceName,
							port: config.servicePort,
						},
					],
				},
			],
		},
	};
}

// =============================================================================
// Middleware Builders
// =============================================================================

/**
 * Build a Traefik Middleware CRD
 */
export function buildTraefikMiddleware(
	config: TraefikMiddlewareConfig,
): CustomResource {
	const spec: Record<string, unknown> = {};

	switch (config.type) {
		case "stripPrefix":
			spec.stripPrefix = config.config;
			break;
		case "redirectScheme":
			spec.redirectScheme = config.config;
			break;
		case "rateLimit":
			spec.rateLimit = config.config;
			break;
		case "headers":
			spec.headers = config.config;
			break;
		case "compress":
			spec.compress = config.config;
			break;
		case "basicAuth":
			spec.basicAuth = config.config;
			break;
		case "forwardAuth":
			spec.forwardAuth = config.config;
			break;
		case "retry":
			spec.retry = config.config;
			break;
	}

	return {
		apiVersion: "traefik.io/v1alpha1",
		kind: "Middleware",
		metadata: {
			name: config.name,
			namespace: config.namespace,
			labels: {
				"dokploy.managed": "true",
			},
		},
		spec,
	};
}

/**
 * Build common middlewares
 */
export const commonMiddlewares = {
	/**
	 * Build HTTPS redirect middleware
	 */
	httpsRedirect: (namespace: string): CustomResource =>
		buildTraefikMiddleware({
			name: "redirect-to-https",
			namespace,
			type: "redirectScheme",
			config: {
				scheme: "https",
				permanent: true,
			},
		}),

	/**
	 * Build strip prefix middleware
	 */
	stripPrefix: (
		name: string,
		namespace: string,
		prefixes: string[],
	): CustomResource =>
		buildTraefikMiddleware({
			name,
			namespace,
			type: "stripPrefix",
			config: {
				prefixes,
			},
		}),

	/**
	 * Build rate limit middleware
	 */
	rateLimit: (
		name: string,
		namespace: string,
		average: number,
		burst: number,
	): CustomResource =>
		buildTraefikMiddleware({
			name,
			namespace,
			type: "rateLimit",
			config: {
				average,
				burst,
			},
		}),

	/**
	 * Build compression middleware
	 */
	compress: (namespace: string): CustomResource =>
		buildTraefikMiddleware({
			name: "compress",
			namespace,
			type: "compress",
			config: {},
		}),

	/**
	 * Build security headers middleware
	 */
	securityHeaders: (namespace: string): CustomResource =>
		buildTraefikMiddleware({
			name: "security-headers",
			namespace,
			type: "headers",
			config: {
				frameDeny: true,
				sslRedirect: true,
				browserXssFilter: true,
				contentTypeNosniff: true,
				referrerPolicy: "same-origin",
				stsSeconds: 31536000,
				stsIncludeSubdomains: true,
				stsPreload: true,
			},
		}),

	/**
	 * Build CORS headers middleware
	 */
	cors: (
		namespace: string,
		origins: string[] = ["*"],
		methods: string[] = ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
	): CustomResource =>
		buildTraefikMiddleware({
			name: "cors-headers",
			namespace,
			type: "headers",
			config: {
				accessControlAllowMethods: methods,
				accessControlAllowOriginList: origins,
				accessControlAllowHeaders: ["Content-Type", "Authorization"],
				accessControlMaxAge: 100,
				addVaryHeader: true,
			},
		}),
};

// =============================================================================
// TLS Option Builders
// =============================================================================

/**
 * Build a Traefik TLSOption CRD
 */
export function buildTraefikTLSOption(
	config: TraefikTLSOptionConfig,
): CustomResource {
	return {
		apiVersion: "traefik.io/v1alpha1",
		kind: "TLSOption",
		metadata: {
			name: config.name,
			namespace: config.namespace,
			labels: {
				"dokploy.managed": "true",
			},
		},
		spec: {
			minVersion: config.minVersion || "VersionTLS12",
			maxVersion: config.maxVersion,
			cipherSuites: config.cipherSuites,
			sniStrict: config.sniStrict,
		},
	};
}

/**
 * Build a modern TLS configuration
 */
export function buildModernTLSOption(namespace: string): CustomResource {
	return buildTraefikTLSOption({
		name: "modern-tls",
		namespace,
		minVersion: "VersionTLS13",
	});
}

/**
 * Build an intermediate TLS configuration (recommended)
 */
export function buildIntermediateTLSOption(namespace: string): CustomResource {
	return buildTraefikTLSOption({
		name: "intermediate-tls",
		namespace,
		minVersion: "VersionTLS12",
		cipherSuites: [
			"TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384",
			"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
			"TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256",
			"TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
			"TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305",
			"TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305",
		],
	});
}

// =============================================================================
// ServersTransport Builder
// =============================================================================

/**
 * Build a Traefik ServersTransport CRD for backend connection options
 */
export function buildTraefikServersTransport(config: {
	name: string;
	namespace: string;
	insecureSkipVerify?: boolean;
	maxIdleConnsPerHost?: number;
	forwardingTimeouts?: {
		dialTimeout?: string;
		responseHeaderTimeout?: string;
		idleConnTimeout?: string;
	};
}): CustomResource {
	return {
		apiVersion: "traefik.io/v1alpha1",
		kind: "ServersTransport",
		metadata: {
			name: config.name,
			namespace: config.namespace,
			labels: {
				"dokploy.managed": "true",
			},
		},
		spec: {
			insecureSkipVerify: config.insecureSkipVerify,
			maxIdleConnsPerHost: config.maxIdleConnsPerHost,
			forwardingTimeouts: config.forwardingTimeouts,
		},
	};
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Build a Traefik match rule
 */
function buildMatchRule(domain: string, pathPrefix?: string): string {
	let rule = `Host(\`${domain}\`)`;

	if (pathPrefix && pathPrefix !== "/") {
		rule += ` && PathPrefix(\`${pathPrefix}\`)`;
	}

	return rule;
}

/**
 * Build a complete routing configuration for an application
 */
export function buildApplicationRouting(config: {
	appName: string;
	namespace: string;
	domain: string;
	port: number;
	ssl?: boolean;
	pathPrefix?: string;
	stripPrefix?: boolean;
	rateLimit?: { average: number; burst: number };
	enableSecurityHeaders?: boolean;
	enableCompression?: boolean;
}): CustomResource[] {
	const resources: CustomResource[] = [];
	const middlewareNames: string[] = [];

	// Add common middlewares if needed
	if (config.ssl) {
		resources.push(commonMiddlewares.httpsRedirect(config.namespace));
		middlewareNames.push("redirect-to-https");
	}

	if (config.stripPrefix && config.pathPrefix) {
		const stripMiddleware = commonMiddlewares.stripPrefix(
			`${config.appName}-strip-prefix`,
			config.namespace,
			[config.pathPrefix],
		);
		resources.push(stripMiddleware);
		middlewareNames.push(`${config.appName}-strip-prefix`);
	}

	if (config.rateLimit) {
		const rateLimitMiddleware = commonMiddlewares.rateLimit(
			`${config.appName}-rate-limit`,
			config.namespace,
			config.rateLimit.average,
			config.rateLimit.burst,
		);
		resources.push(rateLimitMiddleware);
		middlewareNames.push(`${config.appName}-rate-limit`);
	}

	if (config.enableSecurityHeaders) {
		resources.push(commonMiddlewares.securityHeaders(config.namespace));
		middlewareNames.push("security-headers");
	}

	if (config.enableCompression) {
		resources.push(commonMiddlewares.compress(config.namespace));
		middlewareNames.push("compress");
	}

	// Add IngressRoute
	const ingressRoute = buildTraefikIngressRoute({
		name: `${config.appName}-ingress`,
		namespace: config.namespace,
		domain: config.domain,
		serviceName: config.appName,
		servicePort: config.port,
		ssl: config.ssl,
		pathPrefix: config.pathPrefix,
		middlewares: middlewareNames.length > 0 ? middlewareNames : undefined,
	});
	resources.push(ingressRoute);

	return resources;
}
