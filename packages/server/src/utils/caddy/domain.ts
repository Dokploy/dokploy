import * as path from "node:path";
import { paths } from "@dokploy/server/constants";
import { assertCertificatePathAvailableForServer } from "@dokploy/server/services/certificate";
import type { Domain } from "@dokploy/server/services/domain";
import { getCaddyCompileSettings } from "@dokploy/server/services/web-server-settings";
import type { ApplicationNested } from "../builders";
import {
	compileWriteAndReloadCaddyConfigSafely,
	readCaddyRouteFragments,
	removeCaddyRouteFragment,
	restoreCaddyRouteFragments,
	writeCaddyRouteFragment,
} from "./config";
import type { CaddyRouteFragment, CaddyRouteIntent } from "./types";
import { DOKPLOY_CADDY_NETWORK } from "./upstream-targets";

const CADDY_FRAGMENT_VERSION = 1;

const toPunycode = (host: string): string => {
	try {
		return new URL(`http://${host}`).hostname;
	} catch {
		return host;
	}
};

export const getCaddyApplicationFragmentId = (
	appName: string,
	uniqueConfigKey: number,
) => `application.${appName}.${uniqueConfigKey}`;

const createCaddyRouteId = (appName: string, uniqueConfigKey: number) =>
	`${appName}-route-${uniqueConfigKey}`;

const assertSafeCertificatePath = (certificatePath: string) => {
	if (
		!/^[a-zA-Z0-9_.-]+$/.test(certificatePath) ||
		certificatePath === "." ||
		certificatePath === ".." ||
		certificatePath.split(".").some((segment) => segment === "")
	) {
		throw new Error(
			`Invalid Caddy custom certificate path "${certificatePath}". Use an uploaded certificate from Dokploy.`,
		);
	}
};

export const getCaddyCustomCertificateFiles = (
	serverId: string | null | undefined,
	certificatePath: string,
) => {
	assertSafeCertificatePath(certificatePath);
	const certDir = path.join(
		paths(!!serverId).CERTIFICATES_PATH,
		certificatePath,
	);
	return {
		certificate: path.join(certDir, "chain.crt"),
		key: path.join(certDir, "privkey.key"),
	};
};

export const getUnsupportedCaddyDomainFieldMessages = (domain: Domain) => {
	const messages: string[] = [];
	if (domain.customEntrypoint) {
		messages.push("custom entrypoints are not supported by Caddy routes");
	}
	if (
		domain.https &&
		domain.customCertResolver &&
		domain.certificateType !== "custom"
	) {
		messages.push("custom certificate resolvers are Traefik-specific");
	}
	if (
		domain.https &&
		domain.certificateType === "custom" &&
		!domain.customCertResolver
	) {
		messages.push("custom certificates require an uploaded certificate");
	}
	if (domain.middlewares?.length) {
		messages.push("Traefik middlewares are not translated to Caddy yet");
	}
	return messages;
};

export const assertCaddyDomainSupported = (domain: Domain) => {
	const messages = getUnsupportedCaddyDomainFieldMessages(domain);
	if (messages.length) {
		throw new Error(
			`Domain "${domain.host}" uses unsupported Caddy fields: ${messages.join("; ")}`,
		);
	}
};

export const assertCaddyDomainCertificateAvailable = async (
	serverId: string | null | undefined,
	domain: Domain,
	organizationId?: string | null,
) => {
	if (
		domain.https &&
		domain.certificateType === "custom" &&
		domain.customCertResolver
	) {
		await assertCertificatePathAvailableForServer(
			domain.customCertResolver,
			serverId,
			organizationId,
		);
	}
};

export const createCaddyApplicationRouteIntent = (
	app: ApplicationNested,
	domain: Domain,
): CaddyRouteIntent => {
	assertCaddyDomainSupported(domain);
	const publicPath = domain.path && domain.path !== "/" ? domain.path : null;
	const internalPath =
		domain.internalPath &&
		domain.internalPath !== "/" &&
		domain.internalPath !== domain.path
			? domain.internalPath
			: null;

	return {
		id: createCaddyRouteId(app.appName, domain.uniqueConfigKey),
		source: "dokploy-application",
		hosts: [toPunycode(domain.host)],
		pathPrefix: publicPath,
		https: domain.https && !domain.customEntrypoint,
		upstreams: [`http://${app.appName}:${domain.port || 80}`],
		upstreamNetwork: DOKPLOY_CADDY_NETWORK,
		tlsCertificate:
			domain.https &&
			domain.certificateType === "custom" &&
			domain.customCertResolver
				? getCaddyCustomCertificateFiles(
						app.serverId,
						domain.customCertResolver,
					)
				: null,
		transforms: {
			stripPrefix: domain.stripPath ? publicPath : null,
			addPrefix: internalPath,
		},
	};
};

export const createCaddyApplicationRouteFragment = (
	app: ApplicationNested,
	domain: Domain,
): CaddyRouteFragment => ({
	version: CADDY_FRAGMENT_VERSION,
	id: getCaddyApplicationFragmentId(app.appName, domain.uniqueConfigKey),
	source: "dokploy-application",
	description: `Dokploy application route for ${app.appName}:${domain.uniqueConfigKey}`,
	routes: [createCaddyApplicationRouteIntent(app, domain)],
});

export const manageCaddyDomain = async (
	app: ApplicationNested,
	domain: Domain,
) => {
	const serverId = app.serverId || undefined;
	await assertCaddyDomainCertificateAvailable(
		serverId,
		domain,
		app.environment?.project?.organizationId,
	);
	const options = { serverId };
	const previousFragments = await readCaddyRouteFragments(options);
	try {
		await writeCaddyRouteFragment(
			createCaddyApplicationRouteFragment(app, domain),
			options,
		);
		await compileWriteAndReloadCaddyConfigSafely({
			serverId,
			...(await getCaddyCompileSettings(serverId)),
		});
	} catch (error) {
		await restoreCaddyRouteFragments(previousFragments, options);
		throw error;
	}
};

export const removeCaddyDomain = async (
	app: ApplicationNested,
	uniqueConfigKey: number,
) => {
	const serverId = app.serverId || undefined;
	const options = { serverId };
	const previousFragments = await readCaddyRouteFragments(options);
	try {
		await removeCaddyRouteFragment(
			getCaddyApplicationFragmentId(app.appName, uniqueConfigKey),
			options,
		);
		await compileWriteAndReloadCaddyConfigSafely({
			serverId,
			...(await getCaddyCompileSettings(serverId)),
		});
	} catch (error) {
		await restoreCaddyRouteFragments(previousFragments, options);
		throw error;
	}
};
