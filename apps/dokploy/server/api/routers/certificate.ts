import {
	createCertificate,
	findCertificateById,
	IS_CLOUD,
	removeCertificateById,
	updateCertificate,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	apiCreateCertificate,
	apiFindCertificate,
	apiUpdateCertificate,
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
			return await createCertificate(input, ctx.session.activeOrganizationId);
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
			return true;
		}),
	all: adminProcedure.query(async ({ ctx }) => {
		return await db.query.certificates.findMany({
			where: eq(certificates.organizationId, ctx.session.activeOrganizationId),
		});
	}),
	update: adminProcedure
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
				autoRenew: input.autoRenew,
			});
		}),
});
