import fs from "node:fs";
import path from "node:path";
import { CERTIFICATES_PATH } from "@/server/constants";
import { db } from "@/server/db";
import { type apiCreateCertificate, certificates } from "@/server/db/schema";
import { removeDirectoryIfExistsContent } from "@/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { dump } from "js-yaml";
import type { z } from "zod";

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
) => {
	const certificate = await db
		.insert(certificates)
		.values({
			...certificateData,
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

export const removeCertificateById = async (certificateId: string) => {
	const certificate = await findCertificateById(certificateId);
	const certDir = path.join(CERTIFICATES_PATH, certificate.certificatePath);

	await removeDirectoryIfExistsContent(certDir);
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

export const findCertificates = async () => {
	return await db.query.certificates.findMany();
};

const createCertificateFiles = (certificate: Certificate) => {
	const dockerPath = "/etc/traefik";
	const certDir = path.join(CERTIFICATES_PATH, certificate.certificatePath);
	const crtPath = path.join(certDir, "chain.crt");
	const keyPath = path.join(certDir, "privkey.key");

	const chainPath = path.join(dockerPath, certDir, "chain.crt");
	const keyPathDocker = path.join(dockerPath, certDir, "privkey.key");

	if (!fs.existsSync(certDir)) {
		fs.mkdirSync(certDir, { recursive: true });
	}

	fs.writeFileSync(crtPath, certificate.certificateData);
	fs.writeFileSync(keyPath, certificate.privateKey);

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

	const yamlConfig = dump(traefikConfig);
	const configFile = path.join(certDir, "certificate.yml");
	fs.writeFileSync(configFile, yamlConfig);
};
