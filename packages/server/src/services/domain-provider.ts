import { db } from "../db";
import { domainProviders, apiCreateDomainProvider } from "../db/schema/domain-provider";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { encryptToken, decryptToken } from "../providers/encryption";
import { z } from "zod";

export const createDomainProvider = async (
	organizationId: string,
	data: z.infer<typeof apiCreateDomainProvider>
) => {
	// Encrypt sensitive data before storing
	const encryptedData: Record<string, unknown> = {
		...data,
		organizationId,
	};
	// Encrypt all sensitive credentials
	if ("apiToken" in data && data.apiToken) {
		encryptedData.apiToken = encryptToken(data.apiToken);
	}
	if ("apiKey" in data && data.apiKey) {
		encryptedData.apiKey = encryptToken(data.apiKey);
	}
	if ("clientId" in data && data.clientId) {
		encryptedData.clientId = encryptToken(data.clientId);
	}
	if ("clientSecret" in data && data.clientSecret) {
		encryptedData.clientSecret = encryptToken(data.clientSecret);
	}

	const result = await db
		.insert(domainProviders)
		.values(encryptedData as any)
		.returning();

	return result[0];
};

export const findDomainProvidersByOrganization = (organizationId: string) => {
	return db.query.domainProviders.findMany({
		where: eq(domainProviders.organizationId, organizationId),
		orderBy: domainProviders.createdAt,
	});
};

export const getDecryptedDomainProvider = async (domainProviderId: string) => {
	const provider = await db.query.domainProviders.findFirst({
		where: eq(domainProviders.domainProviderId, domainProviderId),
	});

	if (!provider) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Domain provider not found",
		});
	}

	// Decrypt sensitive data before returning
	const decryptedData: Record<string, unknown> = { ...provider };
	if (provider.apiToken) {
		decryptedData.apiToken = decryptToken(provider.apiToken);
	}
	if (provider.apiKey) {
		decryptedData.apiKey = decryptToken(provider.apiKey);
	}
	if (provider.clientId) {
		decryptedData.clientId = decryptToken(provider.clientId);
	}
	if (provider.clientSecret) {
		decryptedData.clientSecret = decryptToken(provider.clientSecret);
	}

	return decryptedData as typeof provider;
};

export const getActiveDomainProviders = async (organizationId: string) => {
	return db.query.domainProviders.findMany({
		where: eq(domainProviders.organizationId, organizationId) &&
			   eq(domainProviders.active, true),
		orderBy: domainProviders.createdAt,
	});
};