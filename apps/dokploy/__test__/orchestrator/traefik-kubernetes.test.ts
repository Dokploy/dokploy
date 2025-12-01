/**
 * Unit tests for Traefik Kubernetes CRD utilities
 */

import { describe, expect, test } from "vitest";
import {
	buildTraefikIngressRoute,
	buildTraefikIngressRouteTCP,
	buildTraefikIngressRouteUDP,
	buildTraefikMiddleware,
	buildTraefikTLSOption,
	buildModernTLSOption,
	buildIntermediateTLSOption,
	buildTraefikServersTransport,
	buildApplicationRouting,
	commonMiddlewares,
} from "@dokploy/server/utils/traefik/kubernetes";

describe("Traefik Kubernetes CRD Utilities", () => {
	describe("buildTraefikIngressRoute", () => {
		test("creates basic IngressRoute", () => {
			const result = buildTraefikIngressRoute({
				name: "my-app-ingress",
				namespace: "dokploy",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
			});

			expect(result.apiVersion).toBe("traefik.io/v1alpha1");
			expect(result.kind).toBe("IngressRoute");
			expect(result.metadata.name).toBe("my-app-ingress");
			expect(result.metadata.namespace).toBe("dokploy");
			expect(result.spec.entryPoints).toEqual(["web", "websecure"]);
			expect(result.spec.routes).toHaveLength(1);
			expect(result.spec.routes[0].match).toBe("Host(`app.example.com`)");
			expect(result.spec.routes[0].services[0].name).toBe("my-app");
			expect(result.spec.routes[0].services[0].port).toBe(3000);
		});

		test("creates IngressRoute with SSL", () => {
			const result = buildTraefikIngressRoute({
				name: "my-app-ingress",
				namespace: "dokploy",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
				ssl: true,
				certResolver: "letsencrypt",
			});

			expect(result.spec.tls).toBeDefined();
			expect(result.spec.tls.certResolver).toBe("letsencrypt");
		});

		test("creates IngressRoute with path prefix", () => {
			const result = buildTraefikIngressRoute({
				name: "my-app-ingress",
				namespace: "dokploy",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
				pathPrefix: "/api",
			});

			expect(result.spec.routes[0].match).toBe(
				"Host(`app.example.com`) && PathPrefix(`/api`)"
			);
		});

		test("creates IngressRoute with middlewares", () => {
			const result = buildTraefikIngressRoute({
				name: "my-app-ingress",
				namespace: "dokploy",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
				middlewares: ["redirect-to-https", "rate-limit"],
			});

			expect(result.spec.routes[0].middlewares).toHaveLength(2);
			expect(result.spec.routes[0].middlewares[0]).toEqual({
				name: "redirect-to-https",
				namespace: "dokploy",
			});
		});

		test("creates IngressRoute with custom entryPoints", () => {
			const result = buildTraefikIngressRoute({
				name: "my-app-ingress",
				namespace: "dokploy",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
				entryPoints: ["websecure"],
			});

			expect(result.spec.entryPoints).toEqual(["websecure"]);
		});

		test("adds dokploy.managed label", () => {
			const result = buildTraefikIngressRoute({
				name: "my-app-ingress",
				namespace: "dokploy",
				domain: "app.example.com",
				serviceName: "my-app",
				servicePort: 3000,
			});

			expect(result.metadata.labels["dokploy.managed"]).toBe("true");
		});
	});

	describe("buildTraefikIngressRouteTCP", () => {
		test("creates basic TCP IngressRoute", () => {
			const result = buildTraefikIngressRouteTCP({
				name: "my-db-tcp",
				namespace: "dokploy",
				entryPoints: ["postgresql"],
				serviceName: "my-db",
				servicePort: 5432,
			});

			expect(result.apiVersion).toBe("traefik.io/v1alpha1");
			expect(result.kind).toBe("IngressRouteTCP");
			expect(result.spec.routes[0].match).toBe("HostSNI(`*`)");
		});

		test("creates TCP IngressRoute with SNI host", () => {
			const result = buildTraefikIngressRouteTCP({
				name: "my-db-tcp",
				namespace: "dokploy",
				entryPoints: ["postgresql"],
				serviceName: "my-db",
				servicePort: 5432,
				sniHost: "db.example.com",
			});

			expect(result.spec.routes[0].match).toBe("HostSNI(`db.example.com`)");
		});

		test("creates TCP IngressRoute with SSL", () => {
			const result = buildTraefikIngressRouteTCP({
				name: "my-db-tcp",
				namespace: "dokploy",
				entryPoints: ["postgresql"],
				serviceName: "my-db",
				servicePort: 5432,
				ssl: true,
			});

			expect(result.spec.tls).toBeDefined();
			expect(result.spec.tls.passthrough).toBe(false);
		});
	});

	describe("buildTraefikIngressRouteUDP", () => {
		test("creates UDP IngressRoute", () => {
			const result = buildTraefikIngressRouteUDP({
				name: "my-dns-udp",
				namespace: "dokploy",
				entryPoints: ["dns-udp"],
				serviceName: "my-dns",
				servicePort: 53,
			});

			expect(result.apiVersion).toBe("traefik.io/v1alpha1");
			expect(result.kind).toBe("IngressRouteUDP");
			expect(result.spec.entryPoints).toEqual(["dns-udp"]);
			expect(result.spec.routes[0].services[0].port).toBe(53);
		});
	});

	describe("buildTraefikMiddleware", () => {
		test("creates stripPrefix middleware", () => {
			const result = buildTraefikMiddleware({
				name: "strip-api",
				namespace: "dokploy",
				type: "stripPrefix",
				config: { prefixes: ["/api"] },
			});

			expect(result.kind).toBe("Middleware");
			expect(result.spec.stripPrefix).toEqual({ prefixes: ["/api"] });
		});

		test("creates redirectScheme middleware", () => {
			const result = buildTraefikMiddleware({
				name: "redirect-https",
				namespace: "dokploy",
				type: "redirectScheme",
				config: { scheme: "https", permanent: true },
			});

			expect(result.spec.redirectScheme).toEqual({
				scheme: "https",
				permanent: true,
			});
		});

		test("creates rateLimit middleware", () => {
			const result = buildTraefikMiddleware({
				name: "rate-limit",
				namespace: "dokploy",
				type: "rateLimit",
				config: { average: 100, burst: 50 },
			});

			expect(result.spec.rateLimit).toEqual({ average: 100, burst: 50 });
		});

		test("creates headers middleware", () => {
			const result = buildTraefikMiddleware({
				name: "security-headers",
				namespace: "dokploy",
				type: "headers",
				config: { frameDeny: true, sslRedirect: true },
			});

			expect(result.spec.headers).toEqual({
				frameDeny: true,
				sslRedirect: true,
			});
		});

		test("creates compress middleware", () => {
			const result = buildTraefikMiddleware({
				name: "compress",
				namespace: "dokploy",
				type: "compress",
				config: {},
			});

			expect(result.spec.compress).toEqual({});
		});

		test("creates basicAuth middleware", () => {
			const result = buildTraefikMiddleware({
				name: "basic-auth",
				namespace: "dokploy",
				type: "basicAuth",
				config: { secret: "auth-secret" },
			});

			expect(result.spec.basicAuth).toEqual({ secret: "auth-secret" });
		});

		test("creates forwardAuth middleware", () => {
			const result = buildTraefikMiddleware({
				name: "forward-auth",
				namespace: "dokploy",
				type: "forwardAuth",
				config: { address: "http://auth-service/verify" },
			});

			expect(result.spec.forwardAuth).toEqual({
				address: "http://auth-service/verify",
			});
		});

		test("creates retry middleware", () => {
			const result = buildTraefikMiddleware({
				name: "retry",
				namespace: "dokploy",
				type: "retry",
				config: { attempts: 4, initialInterval: "100ms" },
			});

			expect(result.spec.retry).toEqual({
				attempts: 4,
				initialInterval: "100ms",
			});
		});
	});

	describe("commonMiddlewares", () => {
		test("httpsRedirect creates redirect middleware", () => {
			const result = commonMiddlewares.httpsRedirect("dokploy");

			expect(result.metadata.name).toBe("redirect-to-https");
			expect(result.spec.redirectScheme).toEqual({
				scheme: "https",
				permanent: true,
			});
		});

		test("stripPrefix creates strip prefix middleware", () => {
			const result = commonMiddlewares.stripPrefix(
				"strip-api",
				"dokploy",
				["/api", "/v1"]
			);

			expect(result.metadata.name).toBe("strip-api");
			expect(result.spec.stripPrefix).toEqual({
				prefixes: ["/api", "/v1"],
			});
		});

		test("rateLimit creates rate limit middleware", () => {
			const result = commonMiddlewares.rateLimit(
				"my-rate-limit",
				"dokploy",
				100,
				50
			);

			expect(result.metadata.name).toBe("my-rate-limit");
			expect(result.spec.rateLimit).toEqual({ average: 100, burst: 50 });
		});

		test("compress creates compression middleware", () => {
			const result = commonMiddlewares.compress("dokploy");

			expect(result.metadata.name).toBe("compress");
			expect(result.spec.compress).toEqual({});
		});

		test("securityHeaders creates security headers middleware", () => {
			const result = commonMiddlewares.securityHeaders("dokploy");

			expect(result.metadata.name).toBe("security-headers");
			expect(result.spec.headers.frameDeny).toBe(true);
			expect(result.spec.headers.sslRedirect).toBe(true);
			expect(result.spec.headers.browserXssFilter).toBe(true);
			expect(result.spec.headers.stsSeconds).toBe(31536000);
		});

		test("cors creates CORS headers middleware", () => {
			const result = commonMiddlewares.cors("dokploy", ["https://example.com"]);

			expect(result.metadata.name).toBe("cors-headers");
			expect(result.spec.headers.accessControlAllowOriginList).toEqual([
				"https://example.com",
			]);
		});

		test("cors uses default values when not specified", () => {
			const result = commonMiddlewares.cors("dokploy");

			expect(result.spec.headers.accessControlAllowOriginList).toEqual(["*"]);
			expect(result.spec.headers.accessControlAllowMethods).toEqual([
				"GET",
				"POST",
				"PUT",
				"DELETE",
				"OPTIONS",
			]);
		});
	});

	describe("buildTraefikTLSOption", () => {
		test("creates TLS option with min version", () => {
			const result = buildTraefikTLSOption({
				name: "tls-options",
				namespace: "dokploy",
				minVersion: "VersionTLS12",
			});

			expect(result.apiVersion).toBe("traefik.io/v1alpha1");
			expect(result.kind).toBe("TLSOption");
			expect(result.spec.minVersion).toBe("VersionTLS12");
		});

		test("creates TLS option with cipher suites", () => {
			const result = buildTraefikTLSOption({
				name: "tls-options",
				namespace: "dokploy",
				cipherSuites: ["TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384"],
			});

			expect(result.spec.cipherSuites).toEqual([
				"TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
			]);
		});

		test("creates TLS option with sniStrict", () => {
			const result = buildTraefikTLSOption({
				name: "tls-options",
				namespace: "dokploy",
				sniStrict: true,
			});

			expect(result.spec.sniStrict).toBe(true);
		});
	});

	describe("buildModernTLSOption", () => {
		test("creates modern TLS configuration with TLS 1.3", () => {
			const result = buildModernTLSOption("dokploy");

			expect(result.metadata.name).toBe("modern-tls");
			expect(result.spec.minVersion).toBe("VersionTLS13");
		});
	});

	describe("buildIntermediateTLSOption", () => {
		test("creates intermediate TLS configuration with TLS 1.2", () => {
			const result = buildIntermediateTLSOption("dokploy");

			expect(result.metadata.name).toBe("intermediate-tls");
			expect(result.spec.minVersion).toBe("VersionTLS12");
			expect(result.spec.cipherSuites).toBeDefined();
			expect(result.spec.cipherSuites.length).toBeGreaterThan(0);
		});
	});

	describe("buildTraefikServersTransport", () => {
		test("creates ServersTransport", () => {
			const result = buildTraefikServersTransport({
				name: "backend-transport",
				namespace: "dokploy",
				insecureSkipVerify: true,
				maxIdleConnsPerHost: 10,
			});

			expect(result.apiVersion).toBe("traefik.io/v1alpha1");
			expect(result.kind).toBe("ServersTransport");
			expect(result.spec.insecureSkipVerify).toBe(true);
			expect(result.spec.maxIdleConnsPerHost).toBe(10);
		});

		test("creates ServersTransport with timeouts", () => {
			const result = buildTraefikServersTransport({
				name: "backend-transport",
				namespace: "dokploy",
				forwardingTimeouts: {
					dialTimeout: "30s",
					responseHeaderTimeout: "10s",
					idleConnTimeout: "90s",
				},
			});

			expect(result.spec.forwardingTimeouts).toEqual({
				dialTimeout: "30s",
				responseHeaderTimeout: "10s",
				idleConnTimeout: "90s",
			});
		});
	});

	describe("buildApplicationRouting", () => {
		test("creates basic routing configuration", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
			});

			expect(resources).toHaveLength(1);
			expect(resources[0].kind).toBe("IngressRoute");
		});

		test("creates routing with SSL and redirect middleware", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
				ssl: true,
			});

			expect(resources.length).toBeGreaterThanOrEqual(2);

			const redirectMiddleware = resources.find(
				(r) => r.kind === "Middleware" && r.metadata.name === "redirect-to-https"
			);
			expect(redirectMiddleware).toBeDefined();

			const ingressRoute = resources.find((r) => r.kind === "IngressRoute");
			expect(ingressRoute?.spec.tls).toBeDefined();
		});

		test("creates routing with path prefix and strip prefix middleware", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
				pathPrefix: "/api",
				stripPrefix: true,
			});

			const stripMiddleware = resources.find(
				(r) => r.kind === "Middleware" && r.metadata.name === "my-app-strip-prefix"
			);
			expect(stripMiddleware).toBeDefined();
			expect(stripMiddleware?.spec.stripPrefix.prefixes).toEqual(["/api"]);
		});

		test("creates routing with rate limiting", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
				rateLimit: { average: 100, burst: 50 },
			});

			const rateLimitMiddleware = resources.find(
				(r) =>
					r.kind === "Middleware" && r.metadata.name === "my-app-rate-limit"
			);
			expect(rateLimitMiddleware).toBeDefined();
			expect(rateLimitMiddleware?.spec.rateLimit).toEqual({
				average: 100,
				burst: 50,
			});
		});

		test("creates routing with security headers", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
				enableSecurityHeaders: true,
			});

			const securityMiddleware = resources.find(
				(r) => r.kind === "Middleware" && r.metadata.name === "security-headers"
			);
			expect(securityMiddleware).toBeDefined();
		});

		test("creates routing with compression", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
				enableCompression: true,
			});

			const compressMiddleware = resources.find(
				(r) => r.kind === "Middleware" && r.metadata.name === "compress"
			);
			expect(compressMiddleware).toBeDefined();
		});

		test("creates routing with all features enabled", () => {
			const resources = buildApplicationRouting({
				appName: "my-app",
				namespace: "dokploy",
				domain: "app.example.com",
				port: 3000,
				ssl: true,
				pathPrefix: "/api",
				stripPrefix: true,
				rateLimit: { average: 100, burst: 50 },
				enableSecurityHeaders: true,
				enableCompression: true,
			});

			// Should have: IngressRoute + redirect + strip prefix + rate limit + security + compress
			expect(resources.length).toBe(6);

			const ingressRoute = resources.find((r) => r.kind === "IngressRoute");
			expect(ingressRoute?.spec.routes[0].middlewares).toHaveLength(5);
		});
	});
});
