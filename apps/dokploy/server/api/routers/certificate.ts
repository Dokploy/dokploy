import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import {
	apiCreateCertificate,
	apiFindCertificate,
	certificates,
} from "@/server/db/schema";

import { db } from "@/server/db";
import {
	IS_CLOUD,
	createCertificate,
	findCertificateById,
	removeCertificateById,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

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
			return await createCertificate(input, ctx.user.adminId);
		}),

	one: adminProcedure
		.input(apiFindCertificate)
		.query(async ({ input, ctx }) => {
			const certificates = await findCertificateById(input.certificateId);
			if (IS_CLOUD && certificates.adminId !== ctx.user.adminId) {
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
			if (IS_CLOUD && certificates.adminId !== ctx.user.adminId) {
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
			// TODO: Remove this line when the cloud version is ready
			...(IS_CLOUD && { where: eq(certificates.adminId, ctx.user.adminId) }),
		});
	}),
});
