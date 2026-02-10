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
import { createPathMiddlewares, removePathMiddlewares } from "./middleware";

const PREVIEW_APP_NAME_REGEX = /^preview-(.+)-[^-]+$/;

const getPreviewBaseAppName = (appName: string) => {
	const match = appName.match(PREVIEW_APP_NAME_REGEX);
	return match?.[1];
};

const getInheritedPreviewRouterSecurity = async (
	app: ApplicationNested,
	baseAppName?: string,
) => {
	const sourceAppName = baseAppName || getPreviewBaseAppName(app.appName);
	const fileMiddlewares = new Set<string>();
	let tlsOption: string | undefined;

	if (!sourceAppName) {
		return { fileMiddlewares: [] as string[], tlsOption };
	}

	const sourceConfig = app.serverId
		? await loadOrCreateConfigRemote(app.serverId, sourceAppName)
		: loadOrCreateConfig(sourceAppName);

	const routers = Object.values(sourceConfig.http?.routers || {});

	for (const router of routers) {
		const hasWebSecureEntryPoint =
			!router?.entryPoints || router.entryPoints.includes("websecure");

		if (!hasWebSecureEntryPoint) {
			continue;
		}

		for (const middleware of router.middlewares || []) {
			if (
				typeof middleware === "string" &&
				middleware.trim().length > 0 &&
				middleware.endsWith("@file")
			) {
				fileMiddlewares.add(middleware);
			}
		}

		if (
			!tlsOption &&
			typeof router.tls?.options === "string" &&
			router.tls.options.trim().length > 0
		) {
			tlsOption = router.tls.options;
		}
	}

	return { fileMiddlewares: [...fileMiddlewares], tlsOption };
};

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

	const previewBaseAppName =
		domain.domainType === "preview"
			? getPreviewBaseAppName(appName)
			: undefined;

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
			if (previewBaseAppName) {
				middlewareName = `redirect-${previewBaseAppName}-${redirect.uniqueConfigKey}`;
			}
			routerConfig.middlewares?.push(middlewareName);
		}

		// security
		if (security.length > 0) {
			let middlewareName = `auth-${appName}`;
			if (previewBaseAppName) {
				middlewareName = `auth-${previewBaseAppName}`;
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

	// Preview routers are generated in a separate dynamic file. Inherit global
	// @file middlewares and TLS options from the source app's websecure router.
	if (entryPoint === "websecure" && previewBaseAppName) {
		const inherited = await getInheritedPreviewRouterSecurity(
			app,
			previewBaseAppName,
		);

		for (const middleware of inherited.fileMiddlewares) {
			if (!routerConfig.middlewares?.includes(middleware)) {
				routerConfig.middlewares?.push(middleware);
			}
		}

		if (routerConfig.tls && !routerConfig.tls.options && inherited.tlsOption) {
			routerConfig.tls.options = inherited.tlsOption;
		}
	}

	return routerConfig;
};
