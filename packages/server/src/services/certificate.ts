import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCertificate,
	certificates,
} from "@dokploy/server/db/schema";
import { removeDirectoryIfExistsContent } from "@dokploy/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { quote } from "shell-quote";
import { stringify } from "yaml";
import type { z } from "zod";
import { writeContentToPath } from "../utils/filesystem/write-content";
import { ExecError, execAsyncRemote } from "../utils/process/execAsync";

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

export const createCertificate = async (
	certificateData: z.infer<typeof apiCreateCertificate>,
	organizationId: string,
) => {
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

	if (certificate.serverId) {
		await execAsyncRemote(certificate.serverId, `rm -rf ${quote([certDir])}`);
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
		try {
			await execAsyncRemote(
				certificate.serverId,
				`mkdir -p ${quote([certDir])}`,
			);
			await writeContentToPath(
				certificate.serverId,
				crtPath,
				certificate.certificateData,
				{ label: "certificate" },
			);
			await writeContentToPath(
				certificate.serverId,
				keyPath,
				certificate.privateKey,
				{ label: "private key" },
			);
			await writeContentToPath(
				certificate.serverId,
				configFile,
				`${yamlConfig}\n`,
				{ label: "certificate config" },
			);
		} catch (error) {
			if (error instanceof ExecError && error.stderr)
				throw new Error(`${error.message}: ${error.stderr.trim()}`, {
					cause: error,
				});
			throw error;
		}
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
	}

	return cert;
};
