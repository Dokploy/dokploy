import type { IncomingHttpHeaders } from "node:http";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@dokploy/server/db";
import { OidcSettings, oidcSettings } from "@dokploy/server/db/schema";
import { authApi } from "@dokploy/server/lib/auth";

const DEFAULT_MAPPING: NonNullable<OidcSettings["mapping"]> = {
	id: "sub",
	email: "email",
	emailVerified: "email_verified",
	name: "name",
	image: "picture",
};

const mappingSchema = z
	.object({
		id: z.string().trim().optional(),
		email: z.string().trim().optional(),
		emailVerified: z.string().trim().optional(),
		name: z.string().trim().optional(),
		image: z.string().trim().optional(),
	})
	.optional();

export const upsertOidcSettingsInputSchema = z.object({
	enabled: z.boolean(),
	providerId: z.string().trim().min(1),
	displayName: z.string().trim().optional(),
	domain: z.string().trim().optional().nullable(),
	issuer: z.string().trim().url(),
	discoveryUrl: z.string().trim().url(),
	clientId: z.string().trim().min(1),
	clientSecret: z.string().trim().min(1),
	scopes: z.array(z.string().trim().min(1)).optional(),
	pkce: z.boolean().optional(),
	overrideUserInfo: z.boolean().optional(),
	mapping: mappingSchema,
});

const withDefaults = (settings: OidcSettings | null): OidcSettings => {
	if (!settings) {
		return {
			id: "default",
			enabled: false,
			providerId: "oidc",
			displayName: "OpenID Connect",
			domain: null,
			issuer: "",
			discoveryUrl: "",
			clientId: "",
			clientSecret: "",
			scopes: ["openid", "email", "profile"],
			pkce: true,
			overrideUserInfo: false,
			mapping: DEFAULT_MAPPING,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	}

	return {
		...settings,
		mapping: settings.mapping ?? DEFAULT_MAPPING,
		scopes: settings.scopes.length ? settings.scopes : ["openid", "email", "profile"],
	};
};

export const getOidcSettings = async () => {
	const existing = await db.query.oidcSettings.findFirst();
	return withDefaults(existing ?? null);
};

const normalizeScopes = (scopes?: string[] | null) => {
	if (!scopes?.length) return ["openid", "email", "profile"];
	return Array.from(new Set(scopes.map((scope) => scope.trim()).filter(Boolean)));
};

const normalizeDomain = (domain: string | null | undefined, issuer: string) => {
	if (domain && domain.trim()) {
		return domain.trim();
	}
	try {
		const url = new URL(issuer);
		return url.hostname;
	} catch {
		return null;
	}
};

const ensureProviderRemoved = async (providerId: string) => {
	try {
		await db.execute(
			sql`DELETE FROM "sso_provider" WHERE "provider_id" = ${providerId}`,
		);
	} catch (error) {
		if (
			error instanceof Error &&
			"message" in error &&
			typeof error.message === "string" &&
			error.message.includes("relation \"sso_provider\" does not exist")
		) {
			return;
		}
		throw error;
	}
};

// Fetch OIDC discovery document and extract required endpoints.
const fetchOidcDiscovery = async (discoveryUrl: string, issuer: string) => {
	let url = discoveryUrl;
	if (!/\.well-known\//.test(url)) {
		url = url.replace(/\/$/, "") + "/.well-known/openid-configuration";
	}
	const res = await fetch(url, { headers: { accept: "application/json" } });
	if (!res.ok) {
		throw new Error(`discovery fetch failed (${res.status})`);
	}
	const json = (await res.json()) as Record<string, unknown>;
	const authorizationEndpoint = json["authorization_endpoint"] as string | undefined;
	const tokenEndpoint = json["token_endpoint"] as string | undefined;
	const userInfoEndpoint = json["userinfo_endpoint"] as string | undefined;
	const jwksEndpoint = json["jwks_uri"] as string | undefined;
	if (!authorizationEndpoint || !tokenEndpoint) {
		throw new Error("discovery document missing authorization or token endpoint");
	}
	return { authorizationEndpoint, tokenEndpoint, userInfoEndpoint, jwksEndpoint };
};

const registerProvider = async (
	payload: OidcSettings,
	headers: IncomingHttpHeaders,
) => {
	let fallbackDomain = payload.domain ?? "";
	if (!fallbackDomain) {
		try {
			const parsedIssuer = new URL(payload.issuer);
			fallbackDomain = parsedIssuer.hostname;
		} catch {
			fallbackDomain = payload.issuer;
		}
	}

	const headerInit: Record<string, string> = {};
	const cookieHeader = headers.cookie;
	if (Array.isArray(cookieHeader)) {
		headerInit.cookie = cookieHeader.join("; ");
	} else if (cookieHeader) {
		headerInit.cookie = cookieHeader;
	}

	try {
		const discovered = await fetchOidcDiscovery(
			payload.discoveryUrl || payload.issuer,
			payload.issuer,
		);
		await authApi.registerSSOProvider({
			headers: headerInit,
			body: {
				providerId: payload.providerId,
				issuer: payload.issuer,
				domain: fallbackDomain,
				oidcConfig: {
					clientId: payload.clientId,
					clientSecret: payload.clientSecret,
					discoveryEndpoint: payload.discoveryUrl,
					authorizationEndpoint: discovered.authorizationEndpoint,
					tokenEndpoint: discovered.tokenEndpoint,
					userInfoEndpoint: discovered.userInfoEndpoint,
					jwksEndpoint: discovered.jwksEndpoint,
					pkce: payload.pkce,
					scopes: payload.scopes,
					mapping: {
						id: payload.mapping?.id ?? DEFAULT_MAPPING.id,
						email: payload.mapping?.email ?? DEFAULT_MAPPING.email,
						emailVerified:
							payload.mapping?.emailVerified ?? DEFAULT_MAPPING.emailVerified,
						name: payload.mapping?.name ?? DEFAULT_MAPPING.name,
						image: payload.mapping?.image ?? DEFAULT_MAPPING.image,
					},
				},
				overrideUserInfo: payload.overrideUserInfo,
			},
		});
	} catch (error) {
		if (error instanceof Error) {
			throw new Error(`Failed to register OIDC provider: ${error.message}`);
		}
		throw error;
	}
};

export const upsertOidcSettings = async (
	input: z.infer<typeof upsertOidcSettingsInputSchema>,
	headers: IncomingHttpHeaders,
) => {
	const parsed = upsertOidcSettingsInputSchema.parse(input);

	const normalizedScopes = normalizeScopes(parsed.scopes);
	const normalizedDomain = normalizeDomain(parsed.domain ?? null, parsed.issuer);
	const mapping = {
		...DEFAULT_MAPPING,
		...(parsed.mapping ?? {}),
	};
	const pkce = parsed.pkce ?? true;
	const overrideUserInfo = parsed.overrideUserInfo ?? false;

	let current = await db.query.oidcSettings.findFirst({
		where: eq(oidcSettings.providerId, parsed.providerId),
	});

	if (!current) {
		current = await db
			.insert(oidcSettings)
			.values({
				providerId: parsed.providerId,
				enabled: parsed.enabled,
				domain: normalizedDomain,
				displayName: parsed.displayName ?? "OpenID Connect",
				issuer: parsed.issuer,
				discoveryUrl: parsed.discoveryUrl,
				clientId: parsed.clientId,
				clientSecret: parsed.clientSecret,
				scopes: normalizedScopes,
				pkce,
				overrideUserInfo,
				mapping,
				updatedAt: new Date(),
			})
			.returning()
			.then((rows) => rows[0]);
	} else {
		current = await db
			.update(oidcSettings)
			.set({
				enabled: parsed.enabled,
				domain: normalizedDomain,
				displayName: parsed.displayName ?? current?.displayName ?? "OpenID Connect",
				issuer: parsed.issuer,
				discoveryUrl: parsed.discoveryUrl,
				clientId: parsed.clientId,
				clientSecret: parsed.clientSecret,
				scopes: normalizedScopes,
				pkce,
				overrideUserInfo,
				mapping,
				updatedAt: new Date(),
			})
			.where(eq(oidcSettings.id, current.id))
			.returning()
			.then((rows) => rows[0]);
	}

	if (!current) {
		throw new Error("Failed to persist OIDC settings");
	}

	if (!current.enabled) {
		await ensureProviderRemoved(current.providerId);
		return withDefaults(current);
	}

	await ensureProviderRemoved(current.providerId);
	await registerProvider(current, headers);
	return withDefaults(current);
};
