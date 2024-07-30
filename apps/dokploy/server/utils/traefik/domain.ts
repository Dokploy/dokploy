import type { Domain } from "@/server/api/services/domain";
import type { ApplicationNested } from "../builders";
import {
	createServiceConfig,
	loadOrCreateConfig,
	removeTraefikConfig,
	writeTraefikConfig,
} from "./application";
import type { FileConfig, HttpRouter } from "./file-types";

export const manageDomain = async (app: ApplicationNested, domain: Domain) => {
	const { appName } = app;
	const config: FileConfig = loadOrCreateConfig(appName);
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
	writeTraefikConfig(config, appName);
};

export const removeDomain = async (appName: string, uniqueKey: number) => {
	const config: FileConfig = loadOrCreateConfig(appName);

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

	// verify if is the last router if so we delete the router
	if (
		config?.http?.routers &&
		Object.keys(config?.http?.routers).length === 0
	) {
		await removeTraefikConfig(appName);
	} else {
		writeTraefikConfig(config, appName);
	}
};

export const createRouterConfig = async (
	app: ApplicationNested,
	domain: Domain,
	entryPoint: "web" | "websecure",
) => {
	const { appName, redirects, security } = app;
	const { certificateType } = domain;

	const { host, path, https, uniqueConfigKey } = domain;
	const routerConfig: HttpRouter = {
		rule: `Host(\`${host}\`)${path ? ` && PathPrefix(\`${path}\`)` : ""}`,
		service: `${appName}-service-${uniqueConfigKey}`,
		middlewares: [],
		entryPoints: [entryPoint],
	};

	if (entryPoint === "web" && https) {
		routerConfig.middlewares = ["redirect-to-https"];
	}

	if ((entryPoint === "websecure" && https) || !https) {
		// redirects
		for (const redirect of redirects) {
			const middlewareName = `redirect-${appName}-${redirect.uniqueConfigKey}`;
			routerConfig.middlewares?.push(middlewareName);
		}

		// security
		if (security.length > 0) {
			const middlewareName = `auth-${appName}`;
			routerConfig.middlewares?.push(middlewareName);
		}
	}

	if (entryPoint === "websecure") {
		if (certificateType === "letsencrypt") {
			routerConfig.tls = { certResolver: "letsencrypt" };
		} else if (certificateType === "none") {
			routerConfig.tls = undefined;
		}
	}

	return routerConfig;
};
