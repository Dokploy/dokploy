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
		.meta({
			openapi: {
				summary: "Create a certificate",
				description: "Creates a new SSL/TLS certificate. In cloud mode, a server must be specified. Logs an audit entry upon creation.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Get a certificate",
				description: "Returns a single certificate by its ID. Verifies that the certificate belongs to the current organization.",
			},
		})
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
		.meta({
			openapi: {
				summary: "Delete a certificate",
				description: "Deletes a certificate by its ID after verifying organization ownership. Logs an audit entry before removal.",
			},
		})
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
	all: withPermission("certificate", "read")
		.meta({
			openapi: {
				summary: "List all certificates",
				description: "Returns all certificates belonging to the current organization, including their associated server information.",
			},
		})
		.query(async ({ ctx }) => {
		return await db.query.certificates.findMany({
			where: eq(certificates.organizationId, ctx.session.activeOrganizationId),
			with: {
				server: true,
			},
		});
	}),
	update: withPermission("certificate", "update")
		.meta({
			openapi: {
				summary: "Update a certificate",
				description: "Updates the name, certificate data, and private key of an existing certificate. Verifies organization ownership before applying changes.",
			},
		})
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
