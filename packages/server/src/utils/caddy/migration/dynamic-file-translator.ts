import { parse } from "yaml";
import type { FileConfig, HttpMiddleware } from "../../traefik/file-types";
import type {
	CaddyHeaderMap,
	CaddyRouteFragment,
	CaddyRouteIntent,
	CaddyRouteTransform,
} from "../types";
import { parseTraefikRule } from "./traefik-rule-parser";
import type {
	CaddyMiddlewareTranslation,
	CaddyMigrationWarning,
	KnownTraefikMiddlewareMap,
	ResolvedCaddyMiddleware,
} from "./types";

interface DynamicTranslatorOptions {
	sourceFile?: string;
	fragmentId?: string;
	knownMiddlewares?: KnownTraefikMiddlewareMap;
	fileMiddlewares?: Record<string, HttpMiddleware>;
}

const CADDY_FRAGMENT_VERSION = 1;
const httpUrlPrefixRegex = /^https?:\/\//i;

export const defaultKnownTraefikFileMiddlewares: KnownTraefikMiddlewareMap = {
	"redirect-to-https": {
		redirectScheme: { scheme: "https", permanent: true },
	},
	"security-headers": {
		transforms: {
			responseHeaders: {
				"X-Content-Type-Options": "nosniff",
				"X-Frame-Options": "DENY",
			},
		},
	},
};

const toSafeId = (value: string) =>
	value
		.replace(/\.[^.]+$/, "")
		.replace(/[^a-zA-Z0-9_.-]+/g, "-")
		.replace(/^-+|-+$/g, "") || "traefik-dynamic";

const warning = (
	message: string,
	options: {
		source?: string;
		routerName?: string;
		serviceName?: string;
		middlewareName?: string;
		code?: CaddyMigrationWarning["code"];
	},
): CaddyMigrationWarning => ({
	code: options.code ?? "unsupported-middleware",
	message,
	blocking: true,
	source: options.source,
	routerName: options.routerName,
	serviceName: options.serviceName,
	middlewareName: options.middlewareName,
});

const asRecord = (value: unknown) =>
	value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const mergeHeaders = (
	a?: CaddyHeaderMap | null,
	b?: CaddyHeaderMap | null,
) => ({
	...(a ?? {}),
	...(b ?? {}),
});

const mergeTransforms = (
	target: CaddyRouteTransform,
	next: CaddyRouteTransform = {},
) => {
	target.requestHeaders = mergeHeaders(
		target.requestHeaders,
		next.requestHeaders,
	);
	target.responseHeaders = mergeHeaders(
		target.responseHeaders,
		next.responseHeaders,
	);
	if (next.stripPrefix) {
		target.stripPrefix = next.stripPrefix;
	}
	if (next.addPrefix) {
		target.addPrefix = next.addPrefix;
	}
};

const mergeAllowedRemoteIps = (target: string[], next?: string[] | null) => {
	if (!next?.length) {
		return;
	}
	for (const range of next) {
		if (!target.includes(range)) {
			target.push(range);
		}
	}
};

const normalizeMiddlewareName = (name: string) => name.replace(/@file$/, "");

const knownMiddlewareToTranslation = (
	middleware: Partial<ResolvedCaddyMiddleware> & {
		responseHeaders?: CaddyHeaderMap;
		requestHeaders?: CaddyHeaderMap;
	},
): ResolvedCaddyMiddleware => ({
	transforms: {
		...(middleware.transforms ?? {}),
		...(middleware.requestHeaders || middleware.responseHeaders
			? {
					requestHeaders: middleware.requestHeaders,
					responseHeaders: middleware.responseHeaders,
				}
			: {}),
	},
	basicAuth: middleware.basicAuth ?? [],
	allowedRemoteIps: middleware.allowedRemoteIps ?? null,
	redirectScheme: middleware.redirectScheme ?? null,
});

const setResponseHeader = (
	transforms: CaddyRouteTransform,
	name: string,
	value: string,
) => {
	transforms.responseHeaders = {
		...(transforms.responseHeaders ?? {}),
		[name]: value,
	};
};

const translateHeadersMiddleware = (headers: Record<string, unknown>) => {
	const transforms: CaddyRouteTransform = {};
	const customRequestHeaders = asRecord(headers.customRequestHeaders);
	const customResponseHeaders = asRecord(headers.customResponseHeaders);
	if (Object.keys(customRequestHeaders).length) {
		transforms.requestHeaders = customRequestHeaders as CaddyHeaderMap;
	}
	if (Object.keys(customResponseHeaders).length) {
		transforms.responseHeaders = customResponseHeaders as CaddyHeaderMap;
	}
	if (headers.frameDeny === true) {
		setResponseHeader(transforms, "X-Frame-Options", "DENY");
	}
	if (typeof headers.customFrameOptionsValue === "string") {
		setResponseHeader(
			transforms,
			"X-Frame-Options",
			headers.customFrameOptionsValue,
		);
	}
	if (headers.contentTypeNosniff === true) {
		setResponseHeader(transforms, "X-Content-Type-Options", "nosniff");
	}
	if (headers.browserXssFilter === true) {
		setResponseHeader(transforms, "X-XSS-Protection", "1; mode=block");
	}
	if (typeof headers.customBrowserXSSValue === "string") {
		setResponseHeader(
			transforms,
			"X-XSS-Protection",
			headers.customBrowserXSSValue,
		);
	}
	if (typeof headers.contentSecurityPolicy === "string") {
		setResponseHeader(
			transforms,
			"Content-Security-Policy",
			headers.contentSecurityPolicy,
		);
	}
	if (typeof headers.referrerPolicy === "string") {
		setResponseHeader(transforms, "Referrer-Policy", headers.referrerPolicy);
	}
	if (typeof headers.permissionsPolicy === "string") {
		setResponseHeader(
			transforms,
			"Permissions-Policy",
			headers.permissionsPolicy,
		);
	}
	if (typeof headers.featurePolicy === "string") {
		setResponseHeader(transforms, "Feature-Policy", headers.featurePolicy);
	}
	if (typeof headers.stsSeconds === "number" && headers.stsSeconds > 0) {
		setResponseHeader(
			transforms,
			"Strict-Transport-Security",
			[
				`max-age=${headers.stsSeconds}`,
				headers.stsIncludeSubdomains === true ? "includeSubDomains" : null,
				headers.stsPreload === true ? "preload" : null,
			]
				.filter(Boolean)
				.join("; "),
		);
	}
	return transforms;
};

const parseBasicAuthUsers = (users: unknown) => {
	if (!Array.isArray(users)) {
		return [];
	}
	return users.flatMap((user) => {
		if (typeof user !== "string") {
			return [];
		}
		const separatorIndex = user.indexOf(":");
		if (separatorIndex === -1) {
			return [];
		}
		return [
			{
				username: user.slice(0, separatorIndex),
				hash: user.slice(separatorIndex + 1),
			},
		];
	});
};

const isLikelyCaddySupportedBasicAuthHash = (hash: string) =>
	/^\$2[aby]\$/.test(hash);

const findCaseInsensitiveValue = (
	record: Record<string, unknown>,
	key: string,
) => {
	const lowerKey = key.toLowerCase();
	const entry = Object.entries(record).find(
		([entryKey]) => entryKey.toLowerCase() === lowerKey,
	);
	return entry?.[1];
};

const getIpAllowRanges = (middleware: Record<string, unknown>) => {
	const ipConfig = asRecord(middleware.ipAllowList ?? middleware.ipWhiteList);
	const sourceRange = findCaseInsensitiveValue(ipConfig, "sourceRange");
	if (!Array.isArray(sourceRange)) {
		return [];
	}
	return sourceRange
		.map((item) => `${item}`.trim())
		.filter((item) => item.length > 0);
};

const normalizeTraefikServerUrl = (value: string) => {
	if (!httpUrlPrefixRegex.test(value)) {
		return value;
	}
	try {
		const url = new URL(value);
		if (url.port) {
			return value;
		}
		const scheme = url.protocol.replace(":", "");
		const defaultPort = scheme === "https" ? "443" : "80";
		return `${scheme}://${url.hostname}:${defaultPort}`;
	} catch {
		return value;
	}
};

export const translateTraefikMiddleware = (
	middlewareName: string,
	middlewares: Record<string, HttpMiddleware> = {},
	options: DynamicTranslatorOptions & {
		routerName?: string;
		seen?: Set<string>;
	} = {},
): CaddyMiddlewareTranslation => {
	const normalizedName = normalizeMiddlewareName(middlewareName);
	const source = options.sourceFile;
	const seen = options.seen ?? new Set<string>();
	if (seen.has(normalizedName)) {
		return {
			transforms: {},
			basicAuth: [],
			warnings: [
				warning(`Middleware chain cycle at "${normalizedName}"`, {
					source,
					routerName: options.routerName,
					middlewareName: normalizedName,
				}),
			],
		};
	}

	const knownMiddleware = {
		...defaultKnownTraefikFileMiddlewares,
		...(options.knownMiddlewares ?? {}),
	}[normalizedName];
	if (knownMiddleware && !middlewares[normalizedName]) {
		return {
			...knownMiddlewareToTranslation(knownMiddleware),
			warnings: [],
		};
	}

	const middleware = middlewares[normalizedName];
	if (!middleware) {
		return {
			transforms: {},
			basicAuth: [],
			warnings: [
				warning(`Referenced middleware "${middlewareName}" was not found`, {
					source,
					routerName: options.routerName,
					middlewareName,
					code: "unresolved-middleware",
				}),
			],
		};
	}

	const middlewareRecord = middleware as Record<string, unknown>;
	const transforms: CaddyRouteTransform = {};
	const basicAuth: { username: string; hash: string }[] = [];
	const allowedRemoteIps: string[] = [];
	const warnings: CaddyMigrationWarning[] = [];
	let redirectScheme: CaddyMiddlewareTranslation["redirectScheme"] = null;

	const securityMiddleware = middlewareRecord.ipAllowList
		? "ipAllowList"
		: middlewareRecord.ipWhiteList
			? "ipWhiteList"
			: null;
	if (securityMiddleware) {
		const ranges = getIpAllowRanges(middlewareRecord);
		if (ranges.length) {
			mergeAllowedRemoteIps(allowedRemoteIps, ranges);
		} else {
			warnings.push(
				warning(
					`Traefik middleware "${normalizedName}" uses ${securityMiddleware} without a migratable sourceRange`,
					{
						source,
						routerName: options.routerName,
						middlewareName: normalizedName,
						code: "unsupported-security-middleware",
					},
				),
			);
		}
	} else if (middlewareRecord.headers) {
		mergeTransforms(
			transforms,
			translateHeadersMiddleware(asRecord(middlewareRecord.headers)),
		);
	} else if (middlewareRecord.stripPrefix) {
		const prefixes = asRecord(middlewareRecord.stripPrefix).prefixes;
		if (Array.isArray(prefixes) && prefixes.length === 1) {
			transforms.stripPrefix = `${prefixes[0]}`;
		} else {
			warnings.push(
				warning("stripPrefix migration supports exactly one prefix", {
					source,
					routerName: options.routerName,
					middlewareName: normalizedName,
				}),
			);
		}
	} else if (middlewareRecord.addPrefix) {
		const prefix = asRecord(middlewareRecord.addPrefix).prefix;
		if (typeof prefix === "string") {
			transforms.addPrefix = prefix;
		} else {
			warnings.push(
				warning("addPrefix middleware is missing a string prefix", {
					source,
					routerName: options.routerName,
					middlewareName: normalizedName,
				}),
			);
		}
	} else if (middlewareRecord.basicAuth) {
		const basicAuthConfig = asRecord(middlewareRecord.basicAuth);
		for (const account of parseBasicAuthUsers(basicAuthConfig.users)) {
			if (isLikelyCaddySupportedBasicAuthHash(account.hash)) {
				basicAuth.push(account);
				continue;
			}
			warnings.push(
				warning(
					`basicAuth user "${account.username}" uses a hash format that is not supported by the Caddy migration`,
					{
						source,
						routerName: options.routerName,
						middlewareName: normalizedName,
						code: "unsupported-security-middleware",
					},
				),
			);
		}
		if (basicAuthConfig.usersFile) {
			warnings.push(
				warning("basicAuth usersFile cannot be inlined into Caddy migration", {
					source,
					routerName: options.routerName,
					middlewareName: normalizedName,
				}),
			);
		}
	} else if (middlewareRecord.redirectScheme) {
		const redirect = asRecord(middlewareRecord.redirectScheme);
		redirectScheme = {
			scheme: typeof redirect.scheme === "string" ? redirect.scheme : "https",
			permanent: redirect.permanent !== false,
			port: typeof redirect.port === "string" ? redirect.port : null,
		};
	} else if (middlewareRecord.chain) {
		const chain = asRecord(middlewareRecord.chain).middlewares;
		if (!Array.isArray(chain)) {
			warnings.push(
				warning("chain middleware is missing middlewares", {
					source,
					routerName: options.routerName,
					middlewareName: normalizedName,
				}),
			);
		} else {
			const nextSeen = new Set([...seen, normalizedName]);
			for (const chainedName of chain) {
				const translated = translateTraefikMiddleware(
					`${chainedName}`,
					middlewares,
					{
						...options,
						seen: nextSeen,
					},
				);
				mergeTransforms(transforms, translated.transforms);
				basicAuth.push(...translated.basicAuth);
				mergeAllowedRemoteIps(allowedRemoteIps, translated.allowedRemoteIps);
				if (translated.redirectScheme) {
					redirectScheme = translated.redirectScheme;
				}
				warnings.push(...translated.warnings);
			}
		}
	} else {
		warnings.push(
			warning(`Unsupported Traefik middleware "${normalizedName}"`, {
				source,
				routerName: options.routerName,
				middlewareName: normalizedName,
			}),
		);
	}

	return {
		transforms,
		basicAuth,
		allowedRemoteIps: allowedRemoteIps.length ? allowedRemoteIps : null,
		redirectScheme,
		warnings,
	};
};

const collectRouterMiddlewares = (
	middlewareNames: string[] | undefined,
	middlewares: Record<string, HttpMiddleware>,
	options: DynamicTranslatorOptions & { routerName: string },
) => {
	const transforms: CaddyRouteTransform = {};
	const basicAuth: { username: string; hash: string }[] = [];
	const allowedRemoteIps: string[] = [];
	const warnings: CaddyMigrationWarning[] = [];
	let redirectScheme: CaddyMiddlewareTranslation["redirectScheme"] = null;

	for (const middlewareName of middlewareNames ?? []) {
		const translated = translateTraefikMiddleware(
			middlewareName,
			middlewares,
			options,
		);
		mergeTransforms(transforms, translated.transforms);
		basicAuth.push(...translated.basicAuth);
		mergeAllowedRemoteIps(allowedRemoteIps, translated.allowedRemoteIps);
		if (translated.redirectScheme) {
			redirectScheme = translated.redirectScheme;
		}
		warnings.push(...translated.warnings);
	}

	return {
		transforms,
		basicAuth,
		allowedRemoteIps: allowedRemoteIps.length ? allowedRemoteIps : null,
		redirectScheme,
		warnings,
	};
};

const getServiceUpstreams = (
	serviceName: string,
	config: FileConfig,
	options: DynamicTranslatorOptions & { routerName: string },
) => {
	const service = config.http?.services?.[normalizeMiddlewareName(serviceName)];
	if (!service) {
		return {
			upstreams: [],
			warnings: [
				warning(`Referenced service "${serviceName}" was not found`, {
					source: options.sourceFile,
					routerName: options.routerName,
					serviceName,
					code: "unresolved-service",
				}),
			],
		};
	}
	const loadBalancer = (service as Record<string, unknown>).loadBalancer;
	if (!loadBalancer) {
		return {
			upstreams: [],
			warnings: [
				warning(`Service "${serviceName}" is not a loadBalancer service`, {
					source: options.sourceFile,
					routerName: options.routerName,
					serviceName,
					code: "unsupported-service",
				}),
			],
		};
	}
	const loadBalancerRecord = asRecord(loadBalancer);
	const servers = loadBalancerRecord.servers;
	const upstreams = Array.isArray(servers)
		? servers.flatMap((server) => {
				const url = asRecord(server).url;
				return typeof url === "string" ? [normalizeTraefikServerUrl(url)] : [];
			})
		: [];
	const warnings: CaddyMigrationWarning[] = [];
	if (!upstreams.length) {
		warnings.push(
			warning(`Service "${serviceName}" has no loadBalancer servers`, {
				source: options.sourceFile,
				routerName: options.routerName,
				serviceName,
				code: "unsupported-service",
			}),
		);
	}
	if (loadBalancerRecord.passHostHeader === false) {
		warnings.push(
			warning("passHostHeader=false has no direct migration mapping yet", {
				source: options.sourceFile,
				routerName: options.routerName,
				serviceName,
				code: "unsupported-service",
			}),
		);
	}
	for (const key of [
		"sticky",
		"healthCheck",
		"responseForwarding",
		"serversTransport",
	]) {
		if (loadBalancerRecord[key]) {
			warnings.push(
				warning(`Service option "${key}" is not migrated yet`, {
					source: options.sourceFile,
					routerName: options.routerName,
					serviceName,
					code: "unsupported-service",
				}),
			);
		}
	}
	return { upstreams, warnings };
};

const routerUsesHttps = (router: Record<string, unknown>) => {
	if (router.tls) {
		return true;
	}
	const entryPoints = router.entryPoints;
	return Array.isArray(entryPoints)
		? entryPoints.includes("websecure") && !entryPoints.includes("web")
		: false;
};

const isTraefikInternalRouter = (
	routerName: string,
	router: Record<string, unknown>,
) => {
	const service = typeof router.service === "string" ? router.service : "";
	const entryPoints = Array.isArray(router.entryPoints)
		? router.entryPoints.map(String)
		: [];
	return (
		service === "api@internal" ||
		(routerName.includes("traefik-dashboard") &&
			entryPoints.includes("traefik"))
	);
};

export const translateTraefikDynamicConfigToCaddyFragment = (
	input: string | FileConfig,
	options: DynamicTranslatorOptions = {},
): {
	fragment: CaddyRouteFragment;
	routes: CaddyRouteIntent[];
	warnings: CaddyMigrationWarning[];
} => {
	let config: FileConfig;
	try {
		config = typeof input === "string" ? (parse(input) as FileConfig) : input;
	} catch (error) {
		const fragment: CaddyRouteFragment = {
			version: CADDY_FRAGMENT_VERSION,
			id: options.fragmentId ?? "migration.traefik-dynamic.invalid",
			source: "traefik-dynamic-file",
			routes: [],
		};
		return {
			fragment,
			routes: [],
			warnings: [
				warning(
					error instanceof Error
						? error.message
						: "Invalid Traefik dynamic config",
					{ source: options.sourceFile, code: "invalid-config" },
				),
			],
		};
	}

	const routes: CaddyRouteIntent[] = [];
	const warnings: CaddyMigrationWarning[] = [];
	const mergedMiddlewares = {
		...(options.fileMiddlewares ?? {}),
		...(config.http?.middlewares ?? {}),
	};
	for (const [routerName, router] of Object.entries(
		config.http?.routers ?? {},
	)) {
		const routerRecord = router as unknown as Record<string, unknown>;
		if (isTraefikInternalRouter(routerName, routerRecord)) {
			warnings.push({
				code: "unsupported-router",
				message: `Skipped Traefik internal router "${routerName}"; Caddy migration does not expose api@internal/dashboard routes`,
				blocking: false,
				source: options.sourceFile,
				routerName,
				serviceName:
					typeof routerRecord.service === "string"
						? routerRecord.service
						: undefined,
			});
			continue;
		}
		const rule = typeof router.rule === "string" ? router.rule : "";
		const parsedRule = parseTraefikRule(rule, {
			source: options.sourceFile,
			routerName,
		});
		warnings.push(...parsedRule.warnings);

		const middlewareResult = collectRouterMiddlewares(
			router.middlewares,
			mergedMiddlewares,
			{ ...options, routerName },
		);
		warnings.push(...middlewareResult.warnings);

		const serviceName = router.service;
		const serviceResult = middlewareResult.redirectScheme
			? { upstreams: [], warnings: [] }
			: getServiceUpstreams(serviceName, config, { ...options, routerName });
		warnings.push(...serviceResult.warnings);

		const tls = asRecord(routerRecord.tls);
		if (tls.certResolver && tls.certResolver !== "letsencrypt") {
			warnings.push(
				warning(
					`Custom certResolver "${tls.certResolver}" has no direct Caddy mapping`,
					{
						source: options.sourceFile,
						routerName,
						code: "unsupported-router",
					},
				),
			);
		}

		parsedRule.matches.forEach((match, index) => {
			routes.push({
				id: `${toSafeId(options.sourceFile ?? "dynamic")}-${routerName}${parsedRule.matches.length > 1 ? `-${index + 1}` : ""}`,
				source: "traefik-dynamic-file",
				hosts: match.hosts,
				pathPrefix: match.pathPrefix,
				pathExact: match.pathExact,
				https: middlewareResult.redirectScheme
					? false
					: routerUsesHttps(routerRecord),
				priority: router.priority ?? null,
				upstreams: serviceResult.upstreams,
				transforms: middlewareResult.transforms,
				allowedRemoteIps: middlewareResult.allowedRemoteIps,
				basicAuth: middlewareResult.basicAuth.length
					? middlewareResult.basicAuth
					: null,
				redirectScheme: middlewareResult.redirectScheme,
			});
		});
	}

	const fragment: CaddyRouteFragment = {
		version: CADDY_FRAGMENT_VERSION,
		id:
			options.fragmentId ??
			`migration.traefik-dynamic.${toSafeId(options.sourceFile ?? "manual")}`,
		source: "traefik-dynamic-file",
		description: options.sourceFile
			? `Migrated Traefik dynamic file ${options.sourceFile}`
			: "Migrated Traefik dynamic config",
		routes,
	};

	return { fragment, routes, warnings };
};
