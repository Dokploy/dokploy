import {
	createCertificate,
	findCertificateById,
	IS_CLOUD,
	removeCertificateById,
} from "@dokploy/server";
import {
	apiCertificatesCreateOutput,
	apiCertificatesDeleteOutput,
	apiCertificatesFindAllOutput,
	apiCertificatesFindOneOutput,
} from "@dokploy/server/api";
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
		.output(apiCertificatesCreateOutput)
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
		.output(apiCertificatesFindOneOutput)
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
		.output(apiCertificatesDeleteOutput)
		.mutation(async ({ input, ctx }) => {
			const certificates = await findCertificateById(input.certificateId);
			if (certificates.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not allowed to delete this certificate",
				});
			}
			return await removeCertificateById(input.certificateId);
		}),
	all: adminProcedure
		.output(apiCertificatesFindAllOutput)
		.query(async ({ ctx }) => {
			return await db.query.certificates.findMany({
				where: eq(
					certificates.organizationId,
					ctx.session.activeOrganizationId,
				),
			});
		}),
});
