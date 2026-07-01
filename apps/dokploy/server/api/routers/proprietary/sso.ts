import { normalizeTrustedOrigin } from "@dokploy/server";
import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { member, ssoProvider, user } from "@dokploy/server/db/schema";
import { ssoProviderBodySchema } from "@dokploy/server/db/schema/sso";
import {
	getOrganizationOwnerId,
	requestToHeaders,
} from "@dokploy/server/index";
import { auth } from "@dokploy/server/lib/auth";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import {
	REDACTED_SECRET_VALUE,
	redactSensitiveText,
} from "@dokploy/server/utils/security/redaction";
import {
	assertTenantTrustedOriginAllowed,
	filterTenantTrustedOrigins,
} from "@dokploy/server/utils/security/trusted-origin";
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import {
	createTRPCRouter,
	enterpriseOwnerProcedure,
	enterpriseProcedure,
	publicProcedure,
} from "@/server/api/trpc";

const redactJsonConfigFields = (
	config: string | null | undefined,
	redact: (value: Record<string, unknown>) => void,
) => {
	if (!config) {
		return config;
	}
	try {
		const parsed = JSON.parse(config) as Record<string, unknown>;
		redact(parsed);
		return JSON.stringify(parsed);
	} catch {
		return redactSensitiveText(config);
	}
};

const redactOidcConfig = (config: string | null | undefined) =>
	redactJsonConfigFields(config, (parsed) => {
		if (parsed.clientSecret) {
			parsed.clientSecret = REDACTED_SECRET_VALUE;
		}
	});

const redactConfigFields = (
	config: Record<string, unknown>,
	fields: string[],
) => {
	for (const field of fields) {
		if (config[field]) {
			config[field] = REDACTED_SECRET_VALUE;
		}
	}
};

const redactSamlSecretFields = (config: Record<string, unknown>) => {
	redactConfigFields(config, ["cert", "privateKey", "decryptionPvk"]);

	if (config.idpMetadata && typeof config.idpMetadata === "object") {
		const idpMetadata = config.idpMetadata as Record<string, unknown>;
		redactConfigFields(idpMetadata, [
			"metadata",
			"privateKey",
			"privateKeyPass",
			"encPrivateKey",
			"encPrivateKeyPass",
		]);
	}

	if (config.spMetadata && typeof config.spMetadata === "object") {
		const spMetadata = config.spMetadata as Record<string, unknown>;
		redactConfigFields(spMetadata, [
			"privateKey",
			"privateKeyPass",
			"encPrivateKey",
			"encPrivateKeyPass",
		]);
	}
};

const redactSamlConfig = (config: string | null | undefined) =>
	redactJsonConfigFields(config, redactSamlSecretFields);

const preserveRedactedJsonConfigFields = <T extends Record<string, unknown>>(
	nextConfig: T | undefined,
	existingConfig: string | null | undefined,
	preserve: (
		next: Record<string, unknown>,
		existing: Record<string, unknown>,
	) => void,
) => {
	if (!nextConfig || !existingConfig) {
		return nextConfig;
	}
	try {
		const next = { ...nextConfig } as Record<string, unknown>;
		const existing = JSON.parse(existingConfig) as Record<string, unknown>;
		preserve(next, existing);
		return next as T;
	} catch {
		return nextConfig;
	}
};

const preserveRedactedOidcConfig = (
	nextConfig:
		| NonNullable<z.infer<typeof ssoProviderBodySchema>["oidcConfig"]>
		| undefined,
	existingConfig: string | null | undefined,
) =>
	preserveRedactedJsonConfigFields(
		nextConfig,
		existingConfig,
		(next, existing) => {
			if (next.clientSecret === REDACTED_SECRET_VALUE) {
				next.clientSecret = existing.clientSecret;
			}
		},
	);

const preserveRedactedConfigFields = (
	next: Record<string, unknown>,
	existing: Record<string, unknown>,
	fields: string[],
) => {
	for (const field of fields) {
		if (next[field] === REDACTED_SECRET_VALUE) {
			next[field] = existing[field];
		}
	}
};

const preserveRedactedSamlConfig = (
	nextConfig:
		| NonNullable<z.infer<typeof ssoProviderBodySchema>["samlConfig"]>
		| undefined,
	existingConfig: string | null | undefined,
) =>
	preserveRedactedJsonConfigFields(
		nextConfig,
		existingConfig,
		(next, existing) => {
			preserveRedactedConfigFields(next, existing, [
				"cert",
				"privateKey",
				"decryptionPvk",
			]);
			if (
				next.idpMetadata &&
				typeof next.idpMetadata === "object" &&
				existing.idpMetadata &&
				typeof existing.idpMetadata === "object"
			) {
				const nextMetadata = next.idpMetadata as Record<string, unknown>;
				const existingMetadata = existing.idpMetadata as Record<
					string,
					unknown
				>;
				preserveRedactedConfigFields(nextMetadata, existingMetadata, [
					"metadata",
					"privateKey",
					"privateKeyPass",
					"encPrivateKey",
					"encPrivateKeyPass",
				]);
			}
			if (
				next.spMetadata &&
				typeof next.spMetadata === "object" &&
				existing.spMetadata &&
				typeof existing.spMetadata === "object"
			) {
				const nextMetadata = next.spMetadata as Record<string, unknown>;
				const existingMetadata = existing.spMetadata as Record<string, unknown>;
				preserveRedactedConfigFields(nextMetadata, existingMetadata, [
					"privateKey",
					"privateKeyPass",
					"encPrivateKey",
					"encPrivateKeyPass",
				]);
			}
		},
	);

const redactSsoProviderSecrets = <
	T extends {
		oidcConfig?: string | null;
		samlConfig?: string | null;
	},
>(
	provider: T,
) => ({
	...provider,
	oidcConfig: redactOidcConfig(provider.oidcConfig),
	samlConfig: redactSamlConfig(provider.samlConfig),
});

const resolveTenantTrustedOriginInput = async (origin: string) => {
	try {
		return await assertTenantTrustedOriginAllowed(
			normalizeTrustedOrigin(origin),
		);
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error ? error.message : "Invalid trusted origin",
		});
	}
};

const assertIssuerInTenantTrustedOrigins = async (
	organizationId: string,
	issuer: string,
	message: string,
) => {
	let issuerOrigin: string;
	try {
		issuerOrigin = new URL(normalizeTrustedOrigin(issuer)).origin;
	} catch {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Issuer URL must be a valid URL",
		});
	}
	const ownerId = await getOrganizationOwnerId(organizationId);
	if (!ownerId) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Organization owner not found",
		});
	}
	const ownerUser = await db.query.user.findFirst({
		where: eq(user.id, ownerId),
		columns: { trustedOrigins: true },
	});
	const trustedOrigins = await filterTenantTrustedOrigins(
		ownerUser?.trustedOrigins ?? [],
	);
	const isInTrustedOrigins = trustedOrigins.some(
		(origin) => origin.toLowerCase() === issuerOrigin.toLowerCase(),
	);
	if (!isInTrustedOrigins) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};

export const ssoRouter = createTRPCRouter({
	showSignInWithSSO: publicProcedure.query(async () => {
		if (IS_CLOUD) {
			return true;
		}
		const owner = await db.query.member.findFirst({
			where: eq(member.role, "owner"),
			with: {
				user: {
					columns: {
						enableEnterpriseFeatures: true,
						isValidEnterpriseLicense: true,
					},
				},
			},
			orderBy: [asc(member.createdAt)],
		});

		if (!owner) {
			return false;
		}

		return (
			owner.user.enableEnterpriseFeatures && owner.user.isValidEnterpriseLicense
		);
	}),
	enforceSSO: publicProcedure.query(async () => {
		if (IS_CLOUD) {
			return false;
		}
		const settings = await getWebServerSettings();
		return settings?.enforceSSO ?? false;
	}),
	listProviders: enterpriseProcedure.query(async ({ ctx }) => {
		const providers = await db.query.ssoProvider.findMany({
			where: eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
			columns: {
				id: true,
				providerId: true,
				issuer: true,
				domain: true,
				oidcConfig: true,
				samlConfig: true,
				organizationId: true,
			},
			orderBy: [asc(ssoProvider.createdAt)],
		});
		return providers.map(redactSsoProviderSecrets);
	}),
	getTrustedOrigins: enterpriseProcedure.query(async ({ ctx }) => {
		const ownerId = await getOrganizationOwnerId(
			ctx.session.activeOrganizationId,
		);
		if (!ownerId) return [];
		const ownerUser = await db.query.user.findFirst({
			where: eq(user.id, ownerId),
			columns: { trustedOrigins: true },
		});
		return await filterTenantTrustedOrigins(ownerUser?.trustedOrigins ?? []);
	}),
	one: enterpriseProcedure
		.input(z.object({ providerId: z.string().min(1) }))
		.query(async ({ ctx, input }) => {
			const provider = await db.query.ssoProvider.findFirst({
				where: and(
					eq(ssoProvider.providerId, input.providerId),
					eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
				),
				columns: {
					id: true,
					providerId: true,
					issuer: true,
					domain: true,
					oidcConfig: true,
					samlConfig: true,
					organizationId: true,
				},
			});
			if (!provider) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to access it",
				});
			}
			return redactSsoProviderSecrets(provider);
		}),
	update: enterpriseOwnerProcedure
		.input(ssoProviderBodySchema)
		.mutation(async ({ ctx, input }) => {
			const existing = await db.query.ssoProvider.findFirst({
				where: and(
					eq(ssoProvider.providerId, input.providerId),
					eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
				),
				columns: {
					id: true,
					issuer: true,
					domain: true,
					oidcConfig: true,
					samlConfig: true,
					userId: true,
				},
			});

			if (!existing) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to update it",
				});
			}

			if (existing.userId !== ctx.session.userId) {
				await db
					.update(ssoProvider)
					.set({ userId: ctx.session.userId })
					.where(eq(ssoProvider.id, existing.id));
			}

			const providers = await db.query.ssoProvider.findMany({
				columns: { id: true, domain: true, domainVerified: true },
			});

			for (const provider of providers) {
				if (provider.id === existing.id) continue;
				if (provider.domainVerified !== true) continue;
				const providerDomains = provider.domain
					.split(",")
					.map((d) => d.trim().toLowerCase());
				for (const domain of input.domains) {
					if (providerDomains.includes(domain)) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Domain ${domain} is already registered for another provider`,
						});
					}
				}
			}

			const issuerChanged =
				normalizeTrustedOrigin(existing.issuer) !==
				normalizeTrustedOrigin(input.issuer);
			if (issuerChanged) {
				await assertIssuerInTenantTrustedOrigins(
					ctx.session.activeOrganizationId,
					input.issuer,
					"The new Issuer URL is not in the organization's trusted origins list. Please add it in Manage origins before saving.",
				);
			}

			const domain = input.domains.join(",");
			const updateBody: {
				providerId: string;
				issuer: string;
				domain: string;
				oidcConfig?: (typeof input)["oidcConfig"];
				samlConfig?: (typeof input)["samlConfig"];
			} = {
				issuer: input.issuer,
				domain,
				providerId: input.providerId,
			};
			if (input.oidcConfig != null) {
				updateBody.oidcConfig = preserveRedactedOidcConfig(
					input.oidcConfig,
					existing.oidcConfig,
				);
			}
			if (input.samlConfig != null) {
				updateBody.samlConfig = preserveRedactedSamlConfig(
					input.samlConfig,
					existing.samlConfig,
				);
			}

			await auth.updateSSOProvider({
				params: { providerId: input.providerId },
				body: updateBody,
				headers: requestToHeaders(ctx.req),
			});
			return { success: true };
		}),
	deleteProvider: enterpriseOwnerProcedure
		.input(z.object({ providerId: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			// Obtener el provider antes de eliminarlo para obtener sus dominios
			const providerToDelete = await db.query.ssoProvider.findFirst({
				where: and(
					eq(ssoProvider.providerId, input.providerId),
					eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
				),
				columns: {
					id: true,
					domain: true,
					issuer: true,
				},
			});

			if (!providerToDelete) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to delete it",
				});
			}

			const [deleted] = await db
				.delete(ssoProvider)
				.where(
					and(
						eq(ssoProvider.providerId, input.providerId),
						eq(ssoProvider.organizationId, ctx.session.activeOrganizationId),
					),
				)
				.returning({ id: ssoProvider.id });

			if (!deleted) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message:
						"SSO provider not found or you do not have permission to delete it",
				});
			}

			return { success: true };
		}),
	register: enterpriseOwnerProcedure
		.input(ssoProviderBodySchema)
		.mutation(async ({ ctx, input }) => {
			const organizationId = ctx.session.activeOrganizationId;

			const providers = await db.query.ssoProvider.findMany({
				columns: {
					domain: true,
					domainVerified: true,
				},
			});

			for (const provider of providers) {
				if (provider.domainVerified !== true) continue;
				const providerDomains = provider.domain
					.split(",")
					.map((d) => d.trim().toLowerCase());
				for (const domain of input.domains) {
					if (providerDomains.includes(domain)) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Domain ${domain} is already registered for another provider`,
						});
					}
				}
			}
			const domain = input.domains.join(",");

			await assertIssuerInTenantTrustedOrigins(
				organizationId,
				input.issuer,
				"The Issuer URL is not in the organization's trusted origins list. Please add it in Manage origins before registering.",
			);

			await auth.registerSSOProvider({
				body: {
					...input,
					organizationId,
					domain,
				},
				headers: requestToHeaders(ctx.req),
			});
			return { success: true };
		}),
	addTrustedOrigin: enterpriseOwnerProcedure
		.input(z.object({ origin: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const ownerId = await getOrganizationOwnerId(
				ctx.session.activeOrganizationId,
			);
			if (!ownerId) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Organization owner not found",
				});
			}
			const trustedOrigin = await resolveTenantTrustedOriginInput(input.origin);
			const ownerUser = await db.query.user.findFirst({
				where: eq(user.id, ownerId),
				columns: { trustedOrigins: true },
			});
			const existing = ownerUser?.trustedOrigins || [];
			if (
				existing.some((o) => o.toLowerCase() === trustedOrigin.toLowerCase())
			) {
				return { success: true };
			}
			const next = Array.from(new Set([...existing, trustedOrigin]));
			await db
				.update(user)
				.set({ trustedOrigins: next })
				.where(eq(user.id, ownerId));
			return { success: true };
		}),
	removeTrustedOrigin: enterpriseOwnerProcedure
		.input(z.object({ origin: z.string().min(1) }))
		.mutation(async ({ ctx, input }) => {
			const ownerId = await getOrganizationOwnerId(
				ctx.session.activeOrganizationId,
			);
			if (!ownerId) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Organization owner not found",
				});
			}
			const normalized = normalizeTrustedOrigin(input.origin);
			const ownerUser = await db.query.user.findFirst({
				where: eq(user.id, ownerId),
				columns: { trustedOrigins: true },
			});
			const existing = ownerUser?.trustedOrigins || [];
			const next = existing.filter(
				(o) => o.toLowerCase() !== normalized.toLowerCase(),
			);
			await db
				.update(user)
				.set({ trustedOrigins: next })
				.where(eq(user.id, ownerId));
			return { success: true };
		}),
	updateTrustedOrigin: enterpriseOwnerProcedure
		.input(
			z.object({
				oldOrigin: z.string().min(1),
				newOrigin: z.string().min(1),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const ownerId = await getOrganizationOwnerId(
				ctx.session.activeOrganizationId,
			);
			if (!ownerId) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: "Organization owner not found",
				});
			}
			const oldNorm = normalizeTrustedOrigin(input.oldOrigin);
			const trustedOrigin = await resolveTenantTrustedOriginInput(
				input.newOrigin,
			);
			const ownerUser = await db.query.user.findFirst({
				where: eq(user.id, ownerId),
				columns: { trustedOrigins: true },
			});
			const existing = ownerUser?.trustedOrigins || [];
			const next = existing.map((o) =>
				o.toLowerCase() === oldNorm.toLowerCase() ? trustedOrigin : o,
			);
			await db
				.update(user)
				.set({ trustedOrigins: next })
				.where(eq(user.id, ownerId));
			return { success: true };
		}),
});
