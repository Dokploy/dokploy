import { db } from "@/server/db";
import { type apiCreateSecurity, security } from "@/server/db/schema";
import {
	createSecurityMiddleware,
	removeSecurityMiddleware,
} from "@/server/utils/traefik/security";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { findApplicationById } from "./application";
export type Security = typeof security.$inferSelect;

export const findSecurityById = async (securityId: string) => {
	const application = await db.query.security.findFirst({
		where: eq(security.securityId, securityId),
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Security not found",
		});
	}
	return application;
};

export const createSecurity = async (
	data: z.infer<typeof apiCreateSecurity>,
) => {
	try {
		await db.transaction(async (tx) => {
			const application = await findApplicationById(data.applicationId);

			const securityResponse = await tx
				.insert(security)
				.values({
					...data,
				})
				.returning()
				.then((res) => res[0]);

			if (!securityResponse) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the security",
				});
			}
			await createSecurityMiddleware(application.appName, securityResponse);
			return true;
		});
	} catch (error) {
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create this security",
			cause: error,
		});
	}
};

export const deleteSecurityById = async (securityId: string) => {
	try {
		const result = await db
			.delete(security)
			.where(eq(security.securityId, securityId))
			.returning()
			.then((res) => res[0]);

		if (!result) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Security not found",
			});
		}

		const application = await findApplicationById(result.applicationId);

		removeSecurityMiddleware(application.appName, result);
		return result;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to remove this security",
		});
	}
};

export const updateSecurityById = async (
	securityId: string,
	data: Partial<Security>,
) => {
	try {
		const response = await db
			.update(security)
			.set({
				...data,
			})
			.where(eq(security.securityId, securityId))
			.returning();

		return response[0];
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to update this security",
		});
	}
};
