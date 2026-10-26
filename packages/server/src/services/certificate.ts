import { createPrivateKey, X509Certificate } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCertificate,
	certificates,
} from "@dokploy/server/db/schema";
import {
	applyCaddy,
	syncCaddy,
	syncCaddyInBackground,
	withCaddyQueue,
} from "@dokploy/server/utils/caddy/sync";
import { removeDirectoryIfExistsContent } from "@dokploy/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import { stringify } from "yaml";
import type { z } from "zod";
import { encodeBase64 } from "../utils/docker/utils";
import { execAsyncRemote } from "../utils/process/execAsync";
import { getWebServerProvider } from "./web-server-settings";

export type Certificate = typeof certificates.$inferSelect;

const validateCaddyCertificate = async (
	certificate: Pick<Certificate, "certificateData" | "privateKey" | "serverId">,
) => {
	if ((await getWebServerProvider(certificate.serverId)) !== "caddy") return;
	try {
		const leaf = new X509Certificate(certificate.certificateData);
		if (leaf.checkPrivateKey(createPrivateKey(certificate.privateKey))) return;
	} catch {
		// Do not include certificate or key material in errors.
	}
	throw new TRPCError({
		code: "BAD_REQUEST",
		message: "Provide a valid certificate and its matching private key",
	});
};

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

export const createCertificate = async (
	certificateData: z.infer<typeof apiCreateCertificate>,
	organizationId: string,
) => {
	await validateCaddyCertificate({
		...certificateData,
		serverId: certificateData.serverId ?? null,
	});
	const certificate = await db
		.insert(certificates)
		.values({
			...certificateData,
			organizationId: organizationId,
		})
		.returning();

	if (!certificate || certificate[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to create the certificate",
		});
	}

	const cer = certificate[0];

	await createCertificateFiles(cer);
	syncCaddyInBackground(cer.serverId);

	return cer;
};

// certificatePath feeds rm -rf and mkdir -p; a tampered row must not escape the certificates dir
const resolveCertificateDir = (certificate: Certificate) => {
	const { CERTIFICATES_PATH } = paths(!!certificate.serverId);
	const base = path.resolve(CERTIFICATES_PATH);
	const certDir = path.resolve(base, certificate.certificatePath);
	if (!certDir.startsWith(`${base}${path.sep}`)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Invalid certificate path",
		});
	}
	return certDir;
};

export const removeCertificateById = async (certificateId: string) => {
	const certificate = await findCertificateById(certificateId);
	const certDir = resolveCertificateDir(certificate);
	return withCaddyQueue(certificate.serverId, async () => {
		const isCaddy =
			(await getWebServerProvider(certificate.serverId)) === "caddy";
		const removeFiles = async () => {
			if (certificate.serverId) {
				await execAsyncRemote(
					certificate.serverId,
					`rm -rf ${quote([certDir])}`,
				);
			} else {
				await removeDirectoryIfExistsContent(certDir);
			}
		};
		// Preserve upstream's retryable file-first deletion on Traefik.
		if (!isCaddy) await removeFiles();
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
		// Autosave must stop referring to the files before a restart can lose them.
		if (isCaddy) {
			await applyCaddy(certificate.serverId, true);
			await removeFiles();
		}

		return result;
	});
};

const createCertificateFiles = async (certificate: Certificate) => {
	const certDir = resolveCertificateDir(certificate);
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
			mkdir -p ${quote([certDir])};
			echo "${certificateData}" | base64 -d > ${quote([crtPath])};
			echo "${privateKey}" | base64 -d > ${quote([keyPath])};
			echo "${yamlConfig}" > ${quote([configFile])};
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

export const updateCertificate = async (
	certificateId: string,
	updates: {
		name?: string;
		certificateData?: string;
		privateKey?: string;
	},
) => {
	if (
		updates.certificateData !== undefined ||
		updates.privateKey !== undefined
	) {
		const current = await findCertificateById(certificateId);
		await validateCaddyCertificate({
			...current,
			certificateData: updates.certificateData ?? current.certificateData,
			privateKey: updates.privateKey ?? current.privateKey,
		});
	}
	const updated = await db
		.update(certificates)
		.set({
			...updates,
		})
		.where(eq(certificates.certificateId, certificateId))
		.returning();

	if (!updated || updated[0] === undefined) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Failed to update the certificate",
		});
	}

	const cert = updated[0];

	// If cert data or private key changed, rewrite files
	if (updates.certificateData || updates.privateKey) {
		await createCertificateFiles(cert);
		await syncCaddy(cert.serverId, true);
	}

	return cert;
};
