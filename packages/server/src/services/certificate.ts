import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCertificate,
	type apiUpdateCertificate,
	certificates,
} from "@dokploy/server/db/schema";
import { removeDirectoryIfExistsContent } from "@dokploy/server/utils/filesystem/directory";
import {
	extractCertificateInfo,
	extractDomains,
	extractExpirationDate,
	hasWildcardDomain,
	isWildcardDomain,
	validateCertificateFormat,
} from "@dokploy/server/utils/certificate/validation";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { stringify } from "yaml";
import type { z } from "zod";
import { encodeBase64 } from "../utils/docker/utils";
import { execAsyncRemote } from "../utils/process/execAsync";

export type Certificate = typeof certificates.$inferSelect;

export const findCertificateById = async (certificateId: string) => {
	const certificate = await db.query.certificates.findFirst({
		where: eq(certificates.certificateId, certificateId),
	});

	if (!certificate) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Certificate not found",
		});
	}

	return certificate;
};

export const validateCertificate = (
	certificateData: string,
	privateKey: string,
) => {
	const validation = validateCertificateFormat(certificateData, privateKey);
	if (!validation.isValid) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Certificate validation failed: ${validation.errors.join(", ")}`,
		});
	}
	return validation;
};

export const extractCertificateMetadata = (
	certificateData: string,
	privateKey: string,
) => {
	const info = extractCertificateInfo(certificateData, privateKey);
	
	// Extract domains if not provided
	const domains = info.domains.length > 0 ? info.domains : extractDomains(certificateData);
	
	// Extract expiration if not provided
	const expiresAt = info.expiresAt || extractExpirationDate(certificateData);
	
	// Determine wildcard status
	const isWildcard = hasWildcardDomain(domains);
	
	return {
		domains,
		expiresAt,
		issuer: info.issuer,
		subject: info.subject,
		isWildcard,
	};
};

export const createCertificate = async (
	certificateData: z.infer<typeof apiCreateCertificate>,
	organizationId: string,
) => {
	// Validate certificate format
	validateCertificate(certificateData.certificateData, certificateData.privateKey);
	
	// Extract metadata
	const metadata = extractCertificateMetadata(
		certificateData.certificateData,
		certificateData.privateKey,
	);
	
	const certificate = await db
		.insert(certificates)
		.values({
			...certificateData,
			organizationId: organizationId,
			domains: metadata.domains,
			expiresAt: metadata.expiresAt,
			issuer: metadata.issuer,
			subject: metadata.subject,
			isWildcard: metadata.isWildcard,
			updatedAt: new Date().toISOString(),
		})
		.returning();

	if (!certificate || certificate[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to create the certificate",
		});
	}

	const cer = certificate[0];

	createCertificateFiles(cer);

	return cer;
};

export const updateCertificate = async (
	certificateData: z.infer<typeof apiUpdateCertificate>,
) => {
	const existing = await findCertificateById(certificateData.certificateId);
	
	// If certificate data or private key is being updated, validate and extract metadata
	let metadata: {
		domains?: string[];
		expiresAt?: Date | null;
		issuer?: string | null;
		subject?: string | null;
		isWildcard?: boolean;
	} = {};
	
	if (certificateData.certificateData && certificateData.privateKey) {
		validateCertificate(certificateData.certificateData, certificateData.privateKey);
		metadata = extractCertificateMetadata(
			certificateData.certificateData,
			certificateData.privateKey,
		);
	} else if (certificateData.certificateData) {
		// Only certificate data updated, use existing private key
		validateCertificate(certificateData.certificateData, existing.privateKey);
		metadata = extractCertificateMetadata(
			certificateData.certificateData,
			existing.privateKey,
		);
	} else if (certificateData.privateKey) {
		// Only private key updated, use existing certificate data
		validateCertificate(existing.certificateData, certificateData.privateKey);
		metadata = extractCertificateMetadata(
			existing.certificateData,
			certificateData.privateKey,
		);
	}
	
	const updated = await db
		.update(certificates)
		.set({
			...certificateData,
			...metadata,
			updatedAt: new Date().toISOString(),
		})
		.where(eq(certificates.certificateId, certificateData.certificateId))
		.returning();

	if (!updated || updated[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to update the certificate",
		});
	}

	const cer = updated[0];

	// Recreate certificate files if certificate data or private key changed
	if (certificateData.certificateData || certificateData.privateKey) {
		createCertificateFiles(cer);
	}

	return cer;
};

export const checkExpiration = async (certificateId: string) => {
	const certificate = await findCertificateById(certificateId);
	
	if (!certificate.expiresAt) {
		// Re-extract expiration if not set
		const expiresAt = extractExpirationDate(certificate.certificateData);
		if (expiresAt) {
			await db
				.update(certificates)
				.set({ expiresAt, updatedAt: new Date().toISOString() })
				.where(eq(certificates.certificateId, certificateId));
			return expiresAt;
		}
		return null;
	}
	
	return new Date(certificate.expiresAt);
};

export const findMatchingCertificates = async (
	domain: string,
	organizationId: string,
) => {
	const allCerts = await db.query.certificates.findMany({
		where: eq(certificates.organizationId, organizationId),
	});
	
	const matching: typeof allCerts = [];
	
	for (const cert of allCerts) {
		const certDomains = cert.domains || [];
		
		// Check exact match
		if (certDomains.includes(domain)) {
			matching.push(cert);
			continue;
		}
		
		// Check wildcard match
		for (const certDomain of certDomains) {
			if (isWildcardDomain(certDomain)) {
				// Extract base domain from wildcard (e.g., *.example.com -> example.com)
				const baseDomain = certDomain.replace(/^\*\./, "");
				// Check if the requested domain ends with the base domain
				if (domain.endsWith("." + baseDomain) || domain === baseDomain) {
					matching.push(cert);
					break;
				}
			}
		}
	}
	
	return matching;
};

export const removeCertificateById = async (certificateId: string) => {
	const certificate = await findCertificateById(certificateId);
	const { CERTIFICATES_PATH } = paths(!!certificate.serverId);
	const certDir = path.join(CERTIFICATES_PATH, certificate.certificatePath);

	if (certificate.serverId) {
		await execAsyncRemote(certificate.serverId, `rm -rf ${certDir}`);
	} else {
		await removeDirectoryIfExistsContent(certDir);
	}

	const result = await db
		.delete(certificates)
		.where(eq(certificates.certificateId, certificateId))
		.returning();

	if (!result) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to delete the certificate",
		});
	}

	return result;
};

const createCertificateFiles = async (certificate: Certificate) => {
	const { CERTIFICATES_PATH } = paths(!!certificate.serverId);
	const certDir = path.join(CERTIFICATES_PATH, certificate.certificatePath);
	const crtPath = path.join(certDir, "chain.crt");
	const keyPath = path.join(certDir, "privkey.key");

	const chainPath = path.join(certDir, "chain.crt");
	const keyPathDocker = path.join(certDir, "privkey.key");
	const traefikConfig = {
		tls: {
			certificates: [
				{
					certFile: chainPath,
					keyFile: keyPathDocker,
				},
			],
		},
	};
	const yamlConfig = stringify(traefikConfig);
	const configFile = path.join(certDir, "certificate.yml");

	if (certificate.serverId) {
		const certificateData = encodeBase64(certificate.certificateData);
		const privateKey = encodeBase64(certificate.privateKey);
		const command = `
			mkdir -p ${certDir};
			echo "${certificateData}" | base64 -d > "${crtPath}";
			echo "${privateKey}" | base64 -d > "${keyPath}";
			echo "${yamlConfig}" > "${configFile}";
		`;

		await execAsyncRemote(certificate.serverId, command);
	} else {
		if (!fs.existsSync(certDir)) {
			fs.mkdirSync(certDir, { recursive: true });
		}

		fs.writeFileSync(crtPath, certificate.certificateData);
		fs.writeFileSync(keyPath, certificate.privateKey);

		fs.writeFileSync(configFile, yamlConfig);
	}
};
