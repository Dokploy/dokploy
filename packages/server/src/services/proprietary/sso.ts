import { db } from "@dokploy/server/db";
import { organization } from "@dokploy/server/db/schema";
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
