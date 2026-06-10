import fs from "node:fs";
import path from "node:path";
import { paths } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import {
	type apiCreateCertificate,
	certificates,
	domains,
} from "@dokploy/server/db/schema";
import { removeDirectoryIfExistsContent } from "@dokploy/server/utils/filesystem/directory";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { quote } from "shell-quote";
import { stringify } from "yaml";
import type { z } from "zod";
import { encodeBase64 } from "../utils/docker/utils";
import { execAsyncRemote } from "../utils/process/execAsync";
import { resolveWebServerProvider } from "./web-server-settings";

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

export const findCertificateByPath = async (certificatePath: string) => {
	return db.query.certificates.findFirst({
		where: eq(certificates.certificatePath, certificatePath),
	});
};

export const assertCertificatePathAvailableForServer = async (
	certificatePath: string,
	serverId?: string | null,
	organizationId?: string | null,
) => {
	if (!organizationId) {
		throw new Error(
			"Caddy custom certificate validation requires organization context.",
		);
	}

	const certificate = await findCertificateByPath(certificatePath);
	const expectedServerId = serverId ?? null;

	if (
		!certificate ||
		(certificate.serverId ?? null) !== expectedServerId ||
		certificate.organizationId !== organizationId
	) {
		throw new Error(
			`Caddy custom certificate "${certificatePath}" is not available for this server and organization. Use an uploaded certificate assigned to the same server and project organization.`,
		);
	}

	await assertCertificateFilesReadable(certificate);

	return certificate;
};

const assertCertificateFilesReadable = async (certificate: Certificate) => {
	const { CERTIFICATES_PATH } = paths(!!certificate.serverId);
	const certDir = path.join(CERTIFICATES_PATH, certificate.certificatePath);
	const crtPath = path.join(certDir, "chain.crt");
	const keyPath = path.join(certDir, "privkey.key");

	try {
		if (certificate.serverId) {
			await execAsyncRemote(
				certificate.serverId,
				`test -r ${quote([crtPath])} && test -r ${quote([keyPath])}`,
			);
			return;
		}

		await fs.promises.access(crtPath, fs.constants.R_OK);
		await fs.promises.access(keyPath, fs.constants.R_OK);
	} catch {
		throw new Error(
			`Caddy custom certificate "${certificate.certificatePath}" is missing readable chain.crt or privkey.key files.`,
		);
	}
};

const findActiveCaddyDomainUsingCertificate = async (
	certificate: Certificate,
) => {
	const provider = await resolveWebServerProvider(certificate.serverId);
	if (provider !== "caddy") {
		return null;
	}

	return db.query.domains.findFirst({
		where: and(
			eq(domains.customCertResolver, certificate.certificatePath),
			eq(domains.certificateType, "custom"),
			eq(domains.https, true),
		),
	});
};

const assertCertificateNotUsedByActiveCaddyDomain = async (
	certificate: Certificate,
	action: "delete" | "update",
) => {
	const domain = await findActiveCaddyDomainUsingCertificate(certificate);
	if (!domain) {
		return;
	}

	throw new TRPCError({
		code: "BAD_REQUEST",
		message: `Cannot ${action} certificate "${certificate.name}" because active Caddy domain "${domain.host}" uses it. Change or remove that domain certificate first.`,
	});
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

export const removeCertificateById = async (certificateId: string) => {
	const certificate = await findCertificateById(certificateId);
	await assertCertificateNotUsedByActiveCaddyDomain(certificate, "delete");
	const { CERTIFICATES_PATH } = paths(!!certificate.serverId);
	const certDir = path.join(CERTIFICATES_PATH, certificate.certificatePath);

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

export const updateCertificate = async (
	certificateId: string,
	updates: {
		name?: string;
		certificateData?: string;
		privateKey?: string;
	},
) => {
	const current = await findCertificateById(certificateId);
	if (updates.certificateData || updates.privateKey) {
		await assertCertificateNotUsedByActiveCaddyDomain(current, "update");
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
	}

	return cert;
};
