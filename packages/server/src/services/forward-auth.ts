import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	forwardAuthSettings,
	server,
	ssoProvider,
} from "@dokploy/server/db/schema";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import {
	deriveBaseDomain,
	deriveCookieSecret,
	type ForwardAuthOidcConfig,
	forwardAuthCallbackUrl,
	isForwardAuthRunning,
	removeForwardAuth,
	setupForwardAuth,
} from "@dokploy/server/setup/forward-auth-setup";
import { manageDomain } from "@dokploy/server/utils/traefik/domain";
import {
	manageForwardAuthDomain,
	removeForwardAuthDomain,
	removeForwardAuthMiddleware,
} from "@dokploy/server/utils/traefik/forward-auth";
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { findApplicationById } from "./application";
import { findDomainById, updateDomainById } from "./domain";

const resolveOidcConfig = (provider: {
	issuer: string;
	oidcConfig: string | null;
}): ForwardAuthOidcConfig => {
	if (!provider.oidcConfig) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Forward-auth requires an OIDC provider — SAML is not supported.",
		});
	}

	let parsed: any;
	try {
		parsed = JSON.parse(provider.oidcConfig);
	} catch {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Failed to parse the SSO provider OIDC configuration",
		});
	}

	if (!parsed?.clientId || !parsed?.clientSecret) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "SSO provider OIDC config is missing clientId/clientSecret",
		});
	}

	return {
		clientId: parsed.clientId,
		clientSecret: parsed.clientSecret,
		issuer: provider.issuer,
		scopes: parsed.scopes,
		skipDiscovery: parsed.skipDiscovery,
	};
};

const findProviderForOrg = async (
	providerId: string,
	organizationId: string,
) => {
	const provider = await db.query.ssoProvider.findFirst({
		where: and(
			eq(ssoProvider.providerId, providerId),
			eq(ssoProvider.organizationId, organizationId),
		),
		columns: { providerId: true, issuer: true, oidcConfig: true },
	});
	if (!provider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "SSO provider not found",
		});
	}
	return provider;
};

export const listSsoProvidersForOrg = async (organizationId: string) => {
	return db.query.ssoProvider.findMany({
		where: and(
			eq(ssoProvider.organizationId, organizationId),
			isNotNull(ssoProvider.oidcConfig),
		),
		columns: { providerId: true, issuer: true, domain: true },
		orderBy: [asc(ssoProvider.createdAt)],
	});
};

export const getDomainSsoStatus = async (
	ctx: { session: { activeOrganizationId: string } },
	domainId: string,
) => {
	const domain = await findDomainById(domainId);
	if (domain.applicationId) {
		await checkServicePermissionAndAccess(ctx as any, domain.applicationId, {
			domain: ["read"],
		});
	}
	return { enabled: !!domain.forwardAuthEnabled };
};

const settingsWhere = (serverId: string | null) =>
	serverId
		? eq(forwardAuthSettings.serverId, serverId)
		: isNull(forwardAuthSettings.serverId);

export const getForwardAuthSettings = async (serverId: string | null) => {
	return db.query.forwardAuthSettings.findFirst({
		where: settingsWhere(serverId),
	});
};

export const setForwardAuthSettings = async (input: {
	organizationId: string;
	serverId: string | null;
	authDomain: string;
	https: boolean;
	certificateType: "none" | "letsencrypt" | "custom";
	customCertResolver?: string | null;
}) => {
	const baseDomain = deriveBaseDomain(input.authDomain);
	const existing = await getForwardAuthSettings(input.serverId);

	const values = {
		authDomain: input.authDomain,
		baseDomain,
		https: input.https,
		certificateType: input.certificateType,
		customCertResolver: input.customCertResolver ?? null,
	};

	if (existing) {
		await db
			.update(forwardAuthSettings)
			.set(values)
			.where(settingsWhere(input.serverId));
	} else {
		await db.insert(forwardAuthSettings).values({
			...values,
			serverId: input.serverId,
		});
	}

	await manageForwardAuthDomain(input.serverId, {
		authDomain: input.authDomain,
		https: input.https,
		certificateType: input.certificateType,
		customCertResolver: input.customCertResolver,
	});

	if (existing?.providerId) {
		const proxyRunning = await isForwardAuthRunning(
			input.serverId ?? undefined,
		);
		if (proxyRunning) {
			await deployForwardAuthOnServer({
				serverId: input.serverId ?? undefined,
				providerId: existing.providerId,
				organizationId: input.organizationId,
			});
		}
	}

	return { callbackUrl: forwardAuthCallbackUrl(input.authDomain, input.https) };
};

export const removeForwardAuthSettings = async (serverId: string | null) => {
	const existing = await getForwardAuthSettings(serverId);
	if (!existing) return { ok: true } as const;
	await removeForwardAuthDomain(serverId);
	await db.delete(forwardAuthSettings).where(settingsWhere(serverId));
	return { ok: true } as const;
};

export const deployForwardAuthOnServer = async (input: {
	serverId?: string;
	providerId: string;
	organizationId: string;
}) => {
	const settings = await getForwardAuthSettings(input.serverId ?? null);
	if (!settings) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Set the authentication domain for this server before deploying the proxy.",
		});
	}

	const provider = await findProviderForOrg(
		input.providerId,
		input.organizationId,
	);
	const oidc = resolveOidcConfig(provider);

	await setupForwardAuth({
		serverId: input.serverId,
		oidc,
		cookieSecret: deriveCookieSecret(
			`${input.serverId ?? "host"}:${settings.baseDomain}`,
		),
		authDomain: settings.authDomain,
		baseDomain: settings.baseDomain,
		authDomainHttps: settings.https,
	});

	if (settings.providerId !== input.providerId) {
		await db
			.update(forwardAuthSettings)
			.set({ providerId: input.providerId })
			.where(settingsWhere(input.serverId ?? null));
	}

	return { ok: true } as const;
};

const FORWARD_AUTH_CHECK_TIMEOUT_MS = 4000;

const proxyStatus = async (
	serverId: string | null,
): Promise<"running" | "stopped" | "unknown"> => {
	try {
		const running = await Promise.race([
			isForwardAuthRunning(serverId ?? undefined),
			new Promise<never>((_, reject) =>
				setTimeout(
					() => reject(new Error("timeout")),
					FORWARD_AUTH_CHECK_TIMEOUT_MS,
				),
			),
		]);
		return running ? "running" : "stopped";
	} catch {
		return "unknown";
	}
};

export const getForwardAuthServerStatus = async (organizationId: string) => {
	const servers = await db.query.server.findMany({
		where: and(
			eq(server.organizationId, organizationId),
			isNotNull(server.sshKeyId),
			eq(server.serverType, "deploy"),
		),
		columns: { serverId: true, name: true, ipAddress: true },
		orderBy: [desc(server.createdAt)],
	});

	const targets: {
		serverId: string | null;
		name: string;
		ipAddress: string | null;
	}[] = [
		...(IS_CLOUD
			? []
			: [
					{
						serverId: null,
						name: "Dokploy Server (local)",
						ipAddress: null,
					},
				]),
		...servers.map((s) => ({
			serverId: s.serverId,
			name: s.name,
			ipAddress: s.ipAddress,
		})),
	];

	return Promise.all(
		targets.map(async (t) => {
			const settings = await getForwardAuthSettings(t.serverId);
			return {
				...t,
				status: await proxyStatus(t.serverId),
				authDomain: settings?.authDomain ?? null,
				https: settings?.https ?? true,
				certificateType: settings?.certificateType ?? "none",
				customCertResolver: settings?.customCertResolver ?? null,
				callbackUrl: settings
					? forwardAuthCallbackUrl(settings.authDomain, settings.https)
					: null,
			};
		}),
	);
};

export const removeForwardAuthProxy = async (serverId: string | null) => {
	await removeForwardAuth(serverId ?? undefined);
	await db
		.update(forwardAuthSettings)
		.set({ providerId: null })
		.where(settingsWhere(serverId));
	return { ok: true } as const;
};

const resolveApplicationDomain = async (domainId: string) => {
	const domain = await findDomainById(domainId);
	if (!domain.applicationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"SSO forward-auth is currently only supported on application domains",
		});
	}
	const application = await findApplicationById(domain.applicationId);
	return { domain, application };
};

export const assertApplicationDomainAccess = async (
	ctx: { session: { activeOrganizationId: string } },
	domainId: string,
	action: "create" | "delete",
) => {
	const domain = await findDomainById(domainId);
	if (!domain.applicationId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"SSO forward-auth is currently only supported on application domains",
		});
	}
	await checkServicePermissionAndAccess(ctx as any, domain.applicationId, {
		domain: [action],
	});
	return domain;
};

export const enableForwardAuthOnDomain = async (input: {
	domainId: string;
}) => {
	const { application } = await resolveApplicationDomain(input.domainId);
	const serverId = application.serverId ?? undefined;

	const settings = await getForwardAuthSettings(serverId ?? null);
	if (!settings?.providerId) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Deploy the authentication proxy for this server in SSO settings first.",
		});
	}

	const proxyRunning = await isForwardAuthRunning(serverId);
	if (!proxyRunning) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"The authentication proxy is not deployed on this server. Deploy it in SSO settings first.",
		});
	}

	await updateDomainById(input.domainId, { forwardAuthEnabled: true });
	const domain = await findDomainById(input.domainId);
	await manageDomain(application, domain);

	return { ok: true } as const;
};

export const disableForwardAuthOnDomain = async (input: {
	domainId: string;
}) => {
	const { application, domain } = await resolveApplicationDomain(
		input.domainId,
	);
	const uniqueConfigKey = domain.uniqueConfigKey;

	await updateDomainById(input.domainId, { forwardAuthEnabled: false });
	const updated = await findDomainById(input.domainId);
	await manageDomain(application, updated);
	await removeForwardAuthMiddleware(application, uniqueConfigKey);

	return { ok: true } as const;
};
