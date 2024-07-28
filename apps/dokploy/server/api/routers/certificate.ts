import { adminProcedure, createTRPCRouter } from "@dokploy/server/api/trpc";
import {
	apiCreateCertificate,
	apiFindCertificate,
} from "@dokploy/server/db/schema";
import {
	createCertificate,
	findCertificateById,
	findCertificates,
	removeCertificateById,
} from "../services/certificate";

export const certificateRouter = createTRPCRouter({
	create: adminProcedure
		.input(apiCreateCertificate)
		.mutation(async ({ input }) => {
			return await createCertificate(input);
		}),

	one: adminProcedure.input(apiFindCertificate).query(async ({ input }) => {
		return await findCertificateById(input.certificateId);
	}),
	remove: adminProcedure
		.input(apiFindCertificate)
		.mutation(async ({ input }) => {
			await removeCertificateById(input.certificateId);
			return true;
		}),
	all: adminProcedure.query(async () => {
		return findCertificates();
	}),
});
