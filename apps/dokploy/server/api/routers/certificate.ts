import {
	createCertificate,
	findCertificateById,
	IS_CLOUD,
	removeCertificateById,
	updateCertificate,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";
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
			return cert;
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
			return certificates;
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
		return await db.query.certificates.findMany({
			where: eq(certificates.organizationId, ctx.session.activeOrganizationId),
			with: {
				server: true,
			},
		});
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
			return await updateCertificate(input.certificateId, {
				name: input.name,
				certificateData: input.certificateData,
				privateKey: input.privateKey,
			});
		}),
});
