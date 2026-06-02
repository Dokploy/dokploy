import { db } from "@dokploy/server/db";
import { forwardAuthSettings } from "@dokploy/server/db/schema";
import type { Domain } from "@dokploy/server/services/domain";
import {
	FORWARD_AUTH_PORT,
	FORWARD_AUTH_SERVICE_NAME,
} from "@dokploy/server/setup/forward-auth-setup";
import { eq, isNull } from "drizzle-orm";
import type { ApplicationNested } from "../builders";
import {
	removeTraefikConfig,
	removeTraefikConfigRemote,
	writeTraefikConfig,
	writeTraefikConfigRemote,
} from "./application";
import type { FileConfig } from "./file-types";
import {
	loadMiddlewares,
	loadRemoteMiddlewares,
	writeMiddleware,
} from "./middleware";

export interface AuthDomainConfig {
	authDomain: string;
	https: boolean;
	certificateType: "none" | "letsencrypt" | "custom";
	customCertResolver?: string | null;
}

const TRAEFIK_SERVICE = "forward-auth-proxy";

export const forwardAuthMiddlewareName = (
	appName: string,
	uniqueConfigKey: number,
): string => `forward-auth-${appName}-${uniqueConfigKey}`;

const proxyUrl = () =>
	`http://${FORWARD_AUTH_SERVICE_NAME}:${FORWARD_AUTH_PORT}`;

const loadOrEmptyMiddlewares = async (
	serverId: string | null,
): Promise<FileConfig> => {
	try {
		return serverId
			? await loadRemoteMiddlewares(serverId)
			: loadMiddlewares<FileConfig>();
	} catch {
		return { http: { middlewares: {} } };
	}
};

const persistMiddlewares = async (
	config: FileConfig,
	serverId: string | null,
) => {
	if (serverId) {
		await writeTraefikConfigRemote(config, "middlewares", serverId);
	} else {
		writeMiddleware(config);
	}
};

const loadAuthGateDomain = async (serverId: string | null) => {
	return db.query.forwardAuthSettings.findFirst({
		where: serverId
			? eq(forwardAuthSettings.serverId, serverId)
			: isNull(forwardAuthSettings.serverId),
		columns: { authDomain: true, https: true },
	});
};

export const createForwardAuthMiddleware = async (
	app: ApplicationNested,
	domain: Domain,
) => {
	if (!domain.forwardAuthProviderId) {
		return;
	}

	const authGate = await loadAuthGateDomain(app.serverId ?? null);
	if (!authGate) {
		return;
	}
	const authDomain = authGate.authDomain;
	const authDomainHttps = authGate.https;

	const { appName, serverId } = app;
	const config = await loadOrEmptyMiddlewares(serverId);

	config.http = config.http || {};
	config.http.middlewares = config.http.middlewares || {};

	const name = forwardAuthMiddlewareName(appName, domain.uniqueConfigKey);
	const scheme = authDomainHttps ? "https" : "http";

	config.http.middlewares[name] = {
		forwardAuth: {
			address: `${scheme}://${authDomain}/oauth2/auth`,
			trustForwardHeader: true,
			authResponseHeaders: [
				"X-Auth-Request-User",
				"X-Auth-Request-Email",
				"X-Auth-Request-Preferred-Username",
				"Authorization",
			],
		},
	};

	config.http.middlewares[`${name}-errors`] = {
		errors: {
			status: ["401-403"],
			service: TRAEFIK_SERVICE,
			query: "/oauth2/sign_in?rd={url}",
			statusRewrites: { "401": 302 },
		},
	};

	await persistMiddlewares(config, serverId);
};

export const removeForwardAuthMiddleware = async (
	app: ApplicationNested,
	uniqueConfigKey: number,
) => {
	const { appName, serverId } = app;
	let config: FileConfig;
	try {
		config = serverId
			? await loadRemoteMiddlewares(serverId)
			: loadMiddlewares<FileConfig>();
	} catch {
		return;
	}

	const name = forwardAuthMiddlewareName(appName, uniqueConfigKey);
	let changed = false;
	for (const key of [name, `${name}-errors`]) {
		if (config.http?.middlewares?.[key]) {
			delete config.http.middlewares[key];
			changed = true;
		}
	}
	if (changed) {
		await persistMiddlewares(config, serverId);
	}
};

export const buildAuthDomainRouter = (cfg: AuthDomainConfig): FileConfig => {
	const entry = cfg.https ? "websecure" : "web";
	const oauthRouter: NonNullable<
		NonNullable<FileConfig["http"]>["routers"]
	>[string] = {
		rule: `Host(\`${cfg.authDomain}\`) && PathPrefix(\`/oauth2/\`)`,
		service: TRAEFIK_SERVICE,
		entryPoints: [entry],
		priority: 1000,
	};

	if (cfg.https) {
		if (cfg.certificateType === "letsencrypt") {
			oauthRouter.tls = { certResolver: "letsencrypt" };
		} else if (cfg.certificateType === "custom" && cfg.customCertResolver) {
			oauthRouter.tls = { certResolver: cfg.customCertResolver };
		} else {
			oauthRouter.tls = {};
		}
	}

	return {
		http: {
			routers: { "forward-auth-oauth": oauthRouter },
			services: {
				[TRAEFIK_SERVICE]: {
					loadBalancer: {
						servers: [{ url: proxyUrl() }],
						passHostHeader: true,
					},
				},
			},
		},
	};
};

export const authDomainConfigName = "forward-auth-domain";

export const manageForwardAuthDomain = async (
	serverId: string | null,
	cfg: AuthDomainConfig,
) => {
	const config = buildAuthDomainRouter(cfg);
	if (serverId) {
		await writeTraefikConfigRemote(config, authDomainConfigName, serverId);
	} else {
		writeTraefikConfig(config, authDomainConfigName);
	}
};

export const removeForwardAuthDomain = async (serverId: string | null) => {
	if (serverId) {
		await removeTraefikConfigRemote(authDomainConfigName, serverId);
	} else {
		await removeTraefikConfig(authDomainConfigName);
	}
};
