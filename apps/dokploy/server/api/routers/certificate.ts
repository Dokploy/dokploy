import {
	createCertificate,
	findCertificateById,
	IS_CLOUD,
	removeCertificateById,
	recordActivity,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateCertificate,
	apiFindCertificate,
	certificates,
} from "@/server/db/schema";

export const certificateRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateCertificate)
		.mutation(async ({ input, ctx }) => {
			if (IS_CLOUD && !input.serverId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "Please set a server to create a certificate",
				});
			}
			const certificate = await createCertificate(input, ctx.session.activeOrganizationId);
			await recordActivity({
				userId: ctx.user.id,
				organizationId: ctx.session.activeOrganizationId,
				action: "certificate.create",
				resourceType: "certificate",
				resourceId: certificate.certificateId,
				metadata: { name: certificate.name },
			});
			return certificate;
		}),

	one: adminProcedure
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
	remove: adminProcedure
		.input(apiFindCertificate)
		.mutation(async ({ input, ctx }) => {
			const certificates = await findCertificateById(input.certificateId);
			if (certificates.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this certificate",
				});
			}
			await removeCertificateById(input.certificateId);
			await recordActivity({
				userId: ctx.user.id,
				organizationId: ctx.session.activeOrganizationId,
				action: "certificate.delete",
				resourceType: "certificate",
				resourceId: certificates.certificateId,
				metadata: { name: certificates.name },
			});
			return true;
		}),
	all: adminProcedure.query(async ({ ctx }) => {
		return await db.query.certificates.findMany({
			where: eq(certificates.organizationId, ctx.session.activeOrganizationId),
		});
	}),
});
