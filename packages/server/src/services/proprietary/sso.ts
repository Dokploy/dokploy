import { db } from "@dokploy/server/db";
import { organization } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export const getSSOProviders = async () => {
	const providers = await db.query.ssoProvider.findMany({
		columns: {
			id: true,
			providerId: true,
			issuer: true,
			domain: true,
			oidcConfig: true,
			samlConfig: true,
		},
	});
	return providers;
};

export const requestToHeaders = (req: {
	headers?: Record<string, string | string[] | undefined>;
}): Headers => {
	const headers = new Headers();
	if (req?.headers) {
		for (const [key, value] of Object.entries(req.headers)) {
			if (value !== undefined && key.toLowerCase() !== "host") {
				headers.set(key, Array.isArray(value) ? value.join(", ") : value);
			}
		}
	}
	return headers;
};

export const normalizeTrustedOrigin = (value: string): string => {
	// Keep it simple: trim and remove trailing slashes.
	// e.g. "https://example.com/" -> "https://example.com"
	return value.trim().replace(/\/+$/, "");
};

export const getOrganizationOwnerId = async (organizationId: string) => {
	const org = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
		columns: { ownerId: true },
	});
	if (!org) return null;
	return org.ownerId;
};

/**
 * Enforces the global uniqueness of SSO email domains across ALL
 * organizations. The SSO and social sign-in flows resolve a provider by email
 * domain with no organization context, so a single domain must map to at most
 * one provider in the whole table — otherwise users can be routed to, or
 * provisioned into, the wrong organization's identity provider.
 *
 * `excludeProviderId` skips the provider being edited so an `update` does not
 * collide with itself; `register` omits it because no row exists yet.
 */
export const assertSSODomainsGloballyUnique = async (
	domains: string[],
	excludeProviderId?: string,
): Promise<void> => {
	const providers = await db.query.ssoProvider.findMany({
		columns: { providerId: true, domain: true },
	});

	for (const provider of providers) {
		if (
			excludeProviderId !== undefined &&
			provider.providerId === excludeProviderId
		) {
			continue;
		}
		const providerDomains = provider.domain
			.split(",")
			.map((d) => d.trim().toLowerCase());
		for (const domain of domains) {
			if (providerDomains.includes(domain)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Domain ${domain} is already registered for another provider`,
				});
			}
		}
	}
};
