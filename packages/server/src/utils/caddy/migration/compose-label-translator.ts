import type { Domain } from "@dokploy/server/services/domain";
import { isDokployGeneratedTraefikLabel } from "../../docker/domain";
import type { ListOrDict } from "../../docker/types";
import type { HttpMiddleware } from "../../traefik/file-types";
import type { CaddyRouteFragment, CaddyRouteIntent } from "../types";
import {
	defaultKnownTraefikFileMiddlewares,
	translateTraefikMiddleware,
} from "./dynamic-file-translator";
import { parseTraefikRule } from "./traefik-rule-parser";
import type { CaddyMigrationWarning, KnownTraefikMiddlewareMap } from "./types";

interface ComposeLabelTranslatorOptions {
	sourceFile?: string;
	fragmentId?: string;
	appName?: string;
	serviceName?: string;
	upstreamServiceName?: string;
	upstreamNetwork?: string | null;
	composeType?: "docker-compose" | "stack";
	domains?: Domain[];
	knownMiddlewares?: KnownTraefikMiddlewareMap;
	fileMiddlewares?: Record<string, HttpMiddleware>;
}

interface ParsedRouterLabels {
	rule?: string;
	entryPoints?: string[];
	middlewares?: string[];
	service?: string;
	priority?: number;
	tls?: boolean;
	tlsCertResolver?: string;
}

interface ParsedServiceLabels {
	port?: number;
	scheme?: string;
}

interface LabelClassification {
	label: string;
	dokployGenerated: boolean;
}

const CADDY_FRAGMENT_VERSION = 1;

const toSafeId = (value: string) =>
	value
		.replace(/\.[^.]+$/, "")
		.replace(/[^a-zA-Z0-9_.-]+/g, "-")
		.replace(/^-+|-+$/g, "") || "compose-labels";

const warning = (
	message: string,
	options: ComposeLabelTranslatorOptions & {
		routerName?: string;
		serviceName?: string;
		middlewareName?: string;
		label?: string;
		code?: CaddyMigrationWarning["code"];
	},
): CaddyMigrationWarning => ({
	code: options.code ?? "invalid-label",
	message,
	blocking: true,
	source: options.sourceFile,
	routerName: options.routerName,
	serviceName: options.serviceName,
	middlewareName: options.middlewareName,
	label: options.label,
});

const labelsToStrings = (labels: ListOrDict | undefined): string[] => {
	if (!labels) {
		return [];
	}
	if (Array.isArray(labels)) {
		return labels.map(String);
	}
	return Object.entries(labels).map(([key, value]) =>
		value === null ? key : `${key}=${value}`,
	);
};

const splitLabel = (label: string) => {
	const separatorIndex = label.indexOf("=");
	if (separatorIndex === -1) {
		return { key: label, value: undefined };
	}
	return {
		key: label.slice(0, separatorIndex),
		value: label.slice(separatorIndex + 1),
	};
};

const splitList = (value: string | undefined) =>
	(value ?? "")
		.split(",")
		.map((item) => item.trim())
		.filter(Boolean);

const mergeTransforms = (
	target: NonNullable<CaddyRouteIntent["transforms"]>,
	next: NonNullable<CaddyRouteIntent["transforms"]>,
) => {
	target.requestHeaders = {
		...(target.requestHeaders ?? {}),
		...(next.requestHeaders ?? {}),
	};
	target.responseHeaders = {
		...(target.responseHeaders ?? {}),
		...(next.responseHeaders ?? {}),
	};
	if (next.stripPrefix) target.stripPrefix = next.stripPrefix;
	if (next.addPrefix) target.addPrefix = next.addPrefix;
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

const ensureMiddleware = (
	middlewares: Record<string, Record<string, unknown>>,
	name: string,
) => {
	middlewares[name] ??= {};
	return middlewares[name];
};

const parseBoolean = (value: string | undefined) =>
	value === undefined ? undefined : value === "true";

const setMiddlewareLabel = (
	middlewares: Record<string, Record<string, unknown>>,
	name: string,
	suffix: string,
	value: string | undefined,
) => {
	const middleware = ensureMiddleware(middlewares, name);
	const lowerSuffix = suffix.toLowerCase();
	if (lowerSuffix === "stripprefix.prefixes") {
		middleware.stripPrefix = { prefixes: splitList(value) };
		return true;
	}
	if (lowerSuffix === "addprefix.prefix") {
		middleware.addPrefix = { prefix: value };
		return true;
	}
	if (lowerSuffix === "basicauth.users") {
		middleware.basicAuth = {
			...(middleware.basicAuth as Record<string, unknown> | undefined),
			users: splitList(value),
		};
		return true;
	}
	if (lowerSuffix === "basicauth.usersfile") {
		middleware.basicAuth = {
			...(middleware.basicAuth as Record<string, unknown> | undefined),
			usersFile: value,
		};
		return true;
	}
	if (lowerSuffix === "redirectscheme.scheme") {
		middleware.redirectScheme = {
			...(middleware.redirectScheme as Record<string, unknown> | undefined),
			scheme: value,
		};
		return true;
	}
	if (lowerSuffix === "redirectscheme.permanent") {
		middleware.redirectScheme = {
			...(middleware.redirectScheme as Record<string, unknown> | undefined),
			permanent: parseBoolean(value),
		};
		return true;
	}
	if (lowerSuffix === "redirectscheme.port") {
		middleware.redirectScheme = {
			...(middleware.redirectScheme as Record<string, unknown> | undefined),
			port: value,
		};
		return true;
	}
	if (lowerSuffix === "chain.middlewares") {
		middleware.chain = { middlewares: splitList(value) };
		return true;
	}
	if (lowerSuffix.startsWith("ipallowlist.")) {
		middleware.ipAllowList = {
			...(middleware.ipAllowList as Record<string, unknown> | undefined),
			[suffix.slice("ipallowlist.".length)]: lowerSuffix.endsWith("sourcerange")
				? splitList(value)
				: value,
		};
		return true;
	}
	if (lowerSuffix.startsWith("ipwhitelist.")) {
		middleware.ipWhiteList = {
			...(middleware.ipWhiteList as Record<string, unknown> | undefined),
			[suffix.slice("ipwhitelist.".length)]: lowerSuffix.endsWith("sourcerange")
				? splitList(value)
				: value,
		};
		return true;
	}
	if (lowerSuffix.startsWith("headers.customresponseheaders.")) {
		const header = suffix.slice("headers.customresponseheaders.".length);
		middleware.headers = {
			...(middleware.headers as Record<string, unknown> | undefined),
			customResponseHeaders: {
				...((
					middleware.headers as
						| Record<string, Record<string, string>>
						| undefined
				)?.customResponseHeaders ?? {}),
				[header]: value ?? "",
			},
		};
		return true;
	}
	if (lowerSuffix.startsWith("headers.customrequestheaders.")) {
		const header = suffix.slice("headers.customrequestheaders.".length);
		middleware.headers = {
			...(middleware.headers as Record<string, unknown> | undefined),
			customRequestHeaders: {
				...((
					middleware.headers as
						| Record<string, Record<string, string>>
						| undefined
				)?.customRequestHeaders ?? {}),
				[header]: value ?? "",
			},
		};
		return true;
	}
	return false;
};

const parseComposeLabels = (
	labels: string[],
	options: ComposeLabelTranslatorOptions,
) => {
	const routers: Record<string, ParsedRouterLabels> = {};
	const services: Record<string, ParsedServiceLabels> = {};
	const middlewares: Record<string, Record<string, unknown>> = {};
	const warnings: CaddyMigrationWarning[] = [];
	const classifications: LabelClassification[] = [];

	for (const label of labels) {
		const { key, value } = splitLabel(label);
		const dokployGenerated = isDokployGeneratedTraefikLabel(label, {
			appName: options.appName,
			domains: options.domains,
			includeGenericLabels: true,
		});
		classifications.push({ label, dokployGenerated });

		const routerMatch = key.match(/^traefik\.http\.routers\.([^.]+)\.(.+)$/);
		if (routerMatch?.[1] && routerMatch[2]) {
			const routerName = routerMatch[1];
			const suffix = routerMatch[2];
			routers[routerName] ??= {};
			const lowerSuffix = suffix.toLowerCase();
			if (lowerSuffix === "rule") routers[routerName].rule = value;
			else if (lowerSuffix === "entrypoints") {
				routers[routerName].entryPoints = splitList(value);
			} else if (lowerSuffix === "middlewares") {
				routers[routerName].middlewares = splitList(value);
			} else if (lowerSuffix === "service") routers[routerName].service = value;
			else if (lowerSuffix === "priority") {
				const priority = Number(value);
				if (Number.isFinite(priority)) routers[routerName].priority = priority;
			} else if (lowerSuffix === "tls") {
				routers[routerName].tls = parseBoolean(value) ?? value === "";
			} else if (lowerSuffix === "tls.certresolver") {
				routers[routerName].tlsCertResolver = value;
			} else {
				warnings.push(
					warning(`Unsupported router label suffix "${suffix}"`, {
						...options,
						routerName,
						label,
						code: "unsupported-router",
					}),
				);
			}
			continue;
		}

		const serviceMatch = key.match(/^traefik\.http\.services\.([^.]+)\.(.+)$/);
		if (serviceMatch?.[1] && serviceMatch[2]) {
			const serviceName = serviceMatch[1];
			const suffix = serviceMatch[2];
			services[serviceName] ??= {};
			const lowerSuffix = suffix.toLowerCase();
			if (lowerSuffix === "loadbalancer.server.port") {
				const port = Number(value);
				if (Number.isFinite(port)) services[serviceName].port = port;
			} else if (lowerSuffix === "loadbalancer.server.scheme") {
				services[serviceName].scheme = value;
			} else {
				warnings.push(
					warning(`Unsupported service label suffix "${suffix}"`, {
						...options,
						serviceName,
						label,
						code: "unsupported-service",
					}),
				);
			}
			continue;
		}

		const middlewareMatch = key.match(
			/^traefik\.http\.middlewares\.([^.]+)\.(.+)$/,
		);
		if (middlewareMatch?.[1] && middlewareMatch[2]) {
			const middlewareName = middlewareMatch[1];
			const suffix = middlewareMatch[2];
			if (!setMiddlewareLabel(middlewares, middlewareName, suffix, value)) {
				warnings.push(
					warning(`Unsupported middleware label suffix "${suffix}"`, {
						...options,
						middlewareName,
						label,
						code: "unsupported-middleware",
					}),
				);
			}
			continue;
		}

		if (key.startsWith("traefik.http.")) {
			warnings.push(
				warning(`Unsupported Traefik HTTP label "${key}"`, {
					...options,
					label,
					code: "invalid-label",
				}),
			);
		}
	}

	return { routers, services, middlewares, warnings, classifications };
};

const isSecurityMiddlewareWarning = (item: CaddyMigrationWarning) =>
	item.code === "unsupported-security-middleware";

const dedupeWarnings = (warnings: CaddyMigrationWarning[]) => {
	const seen = new Set<string>();
	return warnings.filter((item) => {
		const key = [
			item.code,
			item.source ?? "",
			item.routerName ?? "",
			item.serviceName ?? "",
			item.middlewareName ?? "",
			item.label ?? "",
			item.message,
		].join("\0");
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const routerUsesHttps = (router: ParsedRouterLabels) =>
	Boolean(router.tls) ||
	Boolean(router.tlsCertResolver) ||
	Boolean(
		router.entryPoints?.includes("websecure") &&
			!router.entryPoints?.includes("web"),
	);

const getRouterUpstreams = (
	routerName: string,
	router: ParsedRouterLabels,
	services: Record<string, ParsedServiceLabels>,
	options: ComposeLabelTranslatorOptions,
) => {
	const serviceName = router.service ?? routerName;
	const service = services[serviceName] ?? services[routerName];
	if (!service?.port) {
		return {
			upstreams: [],
			warnings: [
				warning(
					`Router "${routerName}" references service "${serviceName}" without a migrated port label`,
					{
						...options,
						routerName,
						serviceName,
						code: "unresolved-service",
					},
				),
			],
		};
	}
	const scheme = service.scheme ?? "http";
	const upstreamName =
		options.upstreamServiceName ?? options.serviceName ?? serviceName;
	return {
		upstreams: [`${scheme}://${upstreamName}:${service.port}`],
		warnings: [],
	};
};

export const translateTraefikComposeLabelsToCaddyFragment = (
	labelsInput: ListOrDict | undefined,
	options: ComposeLabelTranslatorOptions = {},
): {
	fragment: CaddyRouteFragment;
	routes: CaddyRouteIntent[];
	warnings: CaddyMigrationWarning[];
	classifications: LabelClassification[];
} => {
	const labels = labelsToStrings(labelsInput);
	const initialParsed = parseComposeLabels(labels, options);
	const generatedSecurityWarnings = initialParsed.classifications.some(
		(item) => item.dokployGenerated,
	)
		? translateParsedComposeRoutes(initialParsed, options).warnings.filter(
				isSecurityMiddlewareWarning,
			)
		: [];
	const hasManualLabels = initialParsed.classifications.some(
		(item) => !item.dokployGenerated,
	);
	const hasGeneratedLabels = initialParsed.classifications.some(
		(item) => item.dokployGenerated,
	);
	const labelsForTranslation =
		hasManualLabels && hasGeneratedLabels
			? labels.filter(
					(_, index) => !initialParsed.classifications[index]?.dokployGenerated,
				)
			: labels;
	const parsed =
		labelsForTranslation === labels
			? initialParsed
			: parseComposeLabels(labelsForTranslation, options);
	const warnings = dedupeWarnings([
		...parsed.warnings,
		...generatedSecurityWarnings,
	]);
	const translatedRoutes = translateParsedComposeRoutes(parsed, options);
	warnings.push(...translatedRoutes.warnings);
	return {
		...translatedRoutes,
		warnings: dedupeWarnings(warnings),
		classifications: initialParsed.classifications,
	};
};

const translateParsedComposeRoutes = (
	parsed: ReturnType<typeof parseComposeLabels>,
	options: ComposeLabelTranslatorOptions,
) => {
	const warnings: CaddyMigrationWarning[] = [];
	const routes: CaddyRouteIntent[] = [];
	const middlewares = {
		...(options.fileMiddlewares ?? {}),
		...(parsed.middlewares as Record<string, HttpMiddleware>),
	};

	for (const [routerName, router] of Object.entries(parsed.routers)) {
		if (!router.rule) {
			warnings.push(
				warning(`Router "${routerName}" is missing a rule label`, {
					...options,
					routerName,
					code: "unsupported-router",
				}),
			);
			continue;
		}

		const rule = parseTraefikRule(router.rule, {
			source: options.sourceFile,
			routerName,
		});
		warnings.push(...rule.warnings);

		const transforms = {};
		const basicAuth: { username: string; hash: string }[] = [];
		const allowedRemoteIps: string[] = [];
		let redirectScheme: CaddyRouteIntent["redirectScheme"] = null;
		for (const middlewareName of router.middlewares ?? []) {
			const translated = translateTraefikMiddleware(
				middlewareName,
				middlewares,
				{
					sourceFile: options.sourceFile,
					routerName,
					knownMiddlewares: {
						...defaultKnownTraefikFileMiddlewares,
						...(options.knownMiddlewares ?? {}),
					},
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

		if (router.tlsCertResolver && router.tlsCertResolver !== "letsencrypt") {
			warnings.push(
				warning(
					`Custom certResolver "${router.tlsCertResolver}" has no direct Caddy mapping`,
					{
						...options,
						routerName,
						code: "unsupported-router",
					},
				),
			);
		}

		const upstreamResult = redirectScheme
			? { upstreams: [], warnings: [] }
			: getRouterUpstreams(routerName, router, parsed.services, options);
		warnings.push(...upstreamResult.warnings);

		rule.matches.forEach((match, index) => {
			routes.push({
				id: `${toSafeId(options.sourceFile ?? options.appName ?? "compose")}-${routerName}${rule.matches.length > 1 ? `-${index + 1}` : ""}`,
				source: "traefik-compose-label",
				hosts: match.hosts,
				pathPrefix: match.pathPrefix,
				pathExact: match.pathExact,
				https: redirectScheme ? false : routerUsesHttps(router),
				priority: router.priority ?? null,
				upstreams: upstreamResult.upstreams,
				upstreamNetwork: options.upstreamNetwork,
				transforms,
				allowedRemoteIps: allowedRemoteIps.length ? allowedRemoteIps : null,
				basicAuth: basicAuth.length ? basicAuth : null,
				redirectScheme,
			});
		});
	}

	const fragment: CaddyRouteFragment = {
		version: CADDY_FRAGMENT_VERSION,
		id:
			options.fragmentId ??
			`migration.traefik-compose-label.${toSafeId(
				options.sourceFile ?? options.appName ?? "compose",
			)}`,
		source: "traefik-compose-label",
		description: options.sourceFile
			? `Migrated Traefik compose labels from ${options.sourceFile}`
			: "Migrated Traefik compose labels",
		routes,
	};

	return {
		fragment,
		routes,
		warnings,
	};
};
