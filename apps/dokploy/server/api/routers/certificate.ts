import {
	createCertificate,
	findCertificateById,
	getAccessibleServerIds,
	IS_CLOUD,
	removeCertificateById,
	updateCertificate,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
import {
	isRedactedSecretValue,
	redactSecretFields,
	redactSecretFieldsList,
} from "@dokploy/server/utils/security/redaction";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateCertificate,
	apiFindCertificate,
	apiUpdateCertificate,
	certificates,
} from "@/server/db/schema";

const assertCertificateServerAccess = async (
	ctx: { session: Parameters<typeof getAccessibleServerIds>[0] },
	serverId?: string | null,
) => {
	if (!serverId) {
		return;
	}

	const accessibleIds = await getAccessibleServerIds(ctx.session);
	if (!accessibleIds.has(serverId)) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this server",
		});
	}
};

export const certificateRouter = createTRPCRouter({
	create: withPermission("certificate", "create")
		.input(apiCreateCertificate)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Please set a server to create a certificate",
				});
			}
			await assertCertificateServerAccess(ctx, input.serverId);
			const cert = await createCertificate(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "certificate",
				resourceId: cert.certificateId,
				resourceName: cert.name,
			});
			return redactSecretFields(cert, ["privateKey"]);
		}),

	one: withPermission("certificate", "read")
		.input(apiFindCertificate)
		.query(async ({ input, ctx }) => {
			const certificates = await findCertificateById(input.certificateId);
			if (certificates.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to access this certificate",
				});
			}
			await assertCertificateServerAccess(ctx, certificates.serverId);
			return redactSecretFields(certificates, ["privateKey"]);
		}),
	remove: withPermission("certificate", "delete")
		.input(apiFindCertificate)
		.mutation(async ({ input, ctx }) => {
			const certificates = await findCertificateById(input.certificateId);
			if (certificates.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this certificate",
				});
			}
			await assertCertificateServerAccess(ctx, certificates.serverId);
			await audit(ctx, {
				action: "delete",
				resourceType: "certificate",
				resourceId: certificates.certificateId,
				resourceName: certificates.name,
			});
			await removeCertificateById(input.certificateId);
			return true;
		}),
	all: withPermission("certificate", "read").query(async ({ ctx }) => {
		const allCertificates = await db.query.certificates.findMany({
			where: eq(certificates.organizationId, ctx.session.activeOrganizationId),
			with: {
				server: true,
			},
		});
		const accessibleIds = await getAccessibleServerIds(ctx.session);
		return redactSecretFieldsList(
			allCertificates.filter(
				(certificate) =>
					!certificate.serverId || accessibleIds.has(certificate.serverId),
			),
			["privateKey"],
		);
	}),
	update: withPermission("certificate", "update")
		.input(apiUpdateCertificate)
		.mutation(async ({ input, ctx }) => {
			const certificate = await findCertificateById(input.certificateId);
			if (certificate.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to update this certificate",
				});
			}
			await assertCertificateServerAccess(ctx, certificate.serverId);
			const updates = {
				name: input.name,
				certificateData: input.certificateData,
				privateKey: input.privateKey,
			};
			if (isRedactedSecretValue(updates.privateKey)) {
				delete updates.privateKey;
			}
			const updated = await updateCertificate(input.certificateId, updates);
			return redactSecretFields(updated, ["privateKey"]);
		}),
});
