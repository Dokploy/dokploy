import type { DomainAccessRule } from "@dokploy/server/db/validations/domain";
import type { Domain } from "@dokploy/server/services/domain";
import type { FileConfig, HttpMiddleware, HttpRouter } from "./file-types";

type AccessRuleMatch = {
	rule: string;
	priority: number;
	middlewares: string[];
};

type MiddlewareDefinitions = Record<string, HttpMiddleware>;

const normalizeRuleName = (value: string) =>
	value
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(0, 48);

const createPathRule = (rule: DomainAccessRule) => {
	const path = rule.path?.trim();

	if (!path || path === "/") {
		return undefined;
	}

	if (rule.pathType === "exact") {
		return `Path(\`${path}\`)`;
	}

	if (rule.pathType === "regexp") {
		return `PathRegexp(\`${path}\`)`;
	}

	return `PathPrefix(\`${path}\`)`;
};

const getMatcherRule = (rule: DomainAccessRule) => {
	const matcherExpression = rule.matcherExpression?.trim();
	if (!matcherExpression) {
		return undefined;
	}

	return matcherExpression;
};

export const getAccessRuleRouterName = (
	appName: string,
	uniqueConfigKey: number,
	entryPoint: string,
	index: number,
) => `${appName}-access-${uniqueConfigKey}-${entryPoint}-${index}`;

export const getAccessRuleMiddlewareNames = (
	appName: string,
	uniqueConfigKey: number,
	index: number,
	rule: DomainAccessRule,
) => {
	const suffix =
		normalizeRuleName(
			rule.name?.trim() || `${rule.pathType || "rule"}-${index + 1}`,
		) || `rule-${index + 1}`;
	const baseName = `access-${appName}-${uniqueConfigKey}-${index}-${suffix}`;

	return {
		basicAuth: `${baseName}-auth`,
		ipAllowList: `${baseName}-ipallow`,
	};
};

export const buildAccessRuleMatches = async (
	appName: string,
	domain: Domain,
) => {
	const rules = (domain.accessRules || []).filter(
		(rule) => rule.enabled !== false,
	);

	const matches: AccessRuleMatch[] = [];
	const middlewareDefinitions: MiddlewareDefinitions = {};

	for (const [index, rule] of rules.entries()) {
		const ruleParts = [createPathRule(rule), getMatcherRule(rule)].filter(
			(value): value is string => !!value,
		);

		const middlewares: string[] = [];
		const names = getAccessRuleMiddlewareNames(
			appName,
			domain.uniqueConfigKey,
			index,
			rule,
		);

		const basicAuthUsername = rule.basicAuthUsername?.trim();
		const basicAuthPasswordHash = rule.basicAuthPasswordHash?.trim();
		if (basicAuthUsername && basicAuthPasswordHash) {
			const user = `${basicAuthUsername}:${basicAuthPasswordHash}`;
			middlewareDefinitions[names.basicAuth] = {
				basicAuth: {
					removeHeader: true,
					users: [user],
				},
			};
			middlewares.push(names.basicAuth);
		}

		if ((rule.ipAllowList || []).length > 0) {
			middlewareDefinitions[names.ipAllowList] = {
				ipAllowList: {
					sourceRange: rule.ipAllowList,
					...(rule.ipStrategyDepth !== undefined ||
					(rule.excludedIPs || []).length > 0
						? {
								ipStrategy: {
									...(rule.ipStrategyDepth !== undefined
										? { depth: rule.ipStrategyDepth }
										: {}),
									...((rule.excludedIPs || []).length > 0
										? { excludedIPs: rule.excludedIPs }
										: {}),
								},
							}
						: {}),
				},
			};
			middlewares.push(names.ipAllowList);
		}

		if (middlewares.length === 0) {
			continue;
		}

		matches.push({
			rule: ruleParts.length > 0 ? ruleParts.join(" && ") : "PathPrefix(`/`)",
			priority: rule.priority || 100,
			middlewares,
		});
	}

	return {
		matches,
		middlewareDefinitions,
	};
};

export const applyAccessRuleMiddlewares = (
	routerConfig: HttpRouter,
	middlewares: string[],
) => {
	routerConfig.middlewares = [
		...(routerConfig.middlewares || []),
		...middlewares,
	];
};

export const attachAccessRuleMiddlewaresToConfig = (
	config: FileConfig,
	middlewares: MiddlewareDefinitions,
) => {
	if (!config.http) {
		config.http = { middlewares: {} };
	}

	if (!config.http.middlewares) {
		config.http.middlewares = {};
	}

	for (const [name, middleware] of Object.entries(middlewares)) {
		config.http.middlewares[name] = middleware;
	}
};

export const removeAccessRuleMiddlewaresFromConfig = (
	config: FileConfig,
	appName: string,
	uniqueConfigKey: number,
) => {
	if (!config.http?.middlewares) {
		return;
	}

	const prefix = `access-${appName}-${uniqueConfigKey}-`;

	for (const middlewareName of Object.keys(config.http.middlewares)) {
		if (middlewareName.startsWith(prefix)) {
			delete config.http.middlewares[middlewareName];
		}
	}

	if (Object.keys(config.http.middlewares).length === 0) {
		delete config.http.middlewares;
	}
	if (config.http && Object.keys(config.http).length === 0) {
		delete config.http;
	}
};

const escapeComposeLabelValue = (value: string) => value.replace(/\$/g, "$$");

export const createComposeAccessRuleMiddlewareLabels = (
	middlewares: MiddlewareDefinitions,
) => {
	const labels: string[] = [];

	for (const [name, middleware] of Object.entries(middlewares)) {
		if ("basicAuth" in middleware) {
			const basicAuth = middleware.basicAuth;
			if (!basicAuth) {
				continue;
			}
			const users = (basicAuth.users || []).map(escapeComposeLabelValue);
			if (users.length > 0) {
				labels.push(
					`traefik.http.middlewares.${name}.basicauth.users=${users.join(",")}`,
				);
			}
			if (basicAuth.removeHeader !== undefined) {
				labels.push(
					`traefik.http.middlewares.${name}.basicauth.removeheader=${basicAuth.removeHeader}`,
				);
			}
		}

		if ("ipWhiteList" in middleware) {
			const ipWhiteList = middleware.ipWhiteList;
			if (!ipWhiteList) {
				continue;
			}
			const sourceRange = ipWhiteList.sourceRange || [];
			if (sourceRange.length > 0) {
				labels.push(
					`traefik.http.middlewares.${name}.ipallowlist.sourcerange=${sourceRange.join(",")}`,
				);
			}

			if (ipWhiteList.ipStrategy?.depth !== undefined) {
				labels.push(
					`traefik.http.middlewares.${name}.ipallowlist.ipstrategy.depth=${ipWhiteList.ipStrategy.depth}`,
				);
			}

			if ((ipWhiteList.ipStrategy?.excludedIPs || []).length > 0) {
				labels.push(
					`traefik.http.middlewares.${name}.ipallowlist.ipstrategy.excludedips=${ipWhiteList.ipStrategy?.excludedIPs?.join(",")}`,
				);
			}
		}

		if ("ipAllowList" in middleware) {
			const ipAllowList = middleware.ipAllowList;
			if (!ipAllowList) {
				continue;
			}
			const sourceRange = ipAllowList.sourceRange || [];
			if (sourceRange.length > 0) {
				labels.push(
					`traefik.http.middlewares.${name}.ipallowlist.sourcerange=${sourceRange.join(",")}`,
				);
			}

			if (ipAllowList.ipStrategy?.depth !== undefined) {
				labels.push(
					`traefik.http.middlewares.${name}.ipallowlist.ipstrategy.depth=${ipAllowList.ipStrategy.depth}`,
				);
			}

			if ((ipAllowList.ipStrategy?.excludedIPs || []).length > 0) {
				labels.push(
					`traefik.http.middlewares.${name}.ipallowlist.ipstrategy.excludedips=${ipAllowList.ipStrategy?.excludedIPs?.join(",")}`,
				);
			}
		}
	}

	return labels;
};
