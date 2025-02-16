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
import { dump } from "js-yaml";
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

	createCertificateFiles(cer);

	return cer;
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
	const yamlConfig = dump(traefikConfig);
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
