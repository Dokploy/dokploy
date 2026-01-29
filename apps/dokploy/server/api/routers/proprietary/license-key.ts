import { user } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	activateLicenseKey,
	deactivateLicenseKey,
	validateLicenseKey,
} from "@/server/utils/enterprise";

export const licenseKeyRouter = createTRPCRouter({
	activate: adminProcedure
		.input(z.object({ licenseKey: z.string() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const currentUserId = ctx.user.id;
				const currentUser = await db.query.user.findFirst({
					where: eq(user.id, currentUserId),
				});
				if (!currentUser) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User not found",
					});
				}

				if (!currentUser.enableEnterpriseFeatures) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Please activate enterprise features to activate license key",
					});
				}

				return await activateLicenseKey(input.licenseKey);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to activate license key",
					cause: error,
				});
			}
		}),
	validate: adminProcedure
		.input(z.object({ licenseKey: z.string() }))
		.mutation(async ({ input, ctx }) => {
			try {
				const currentUserId = ctx.user.id;
				const currentUser = await db.query.user.findFirst({
					where: eq(user.id, currentUserId),
				});
				if (!currentUser) {
					throw new TRPCError({
						code: "NOT_FOUND",
						message: "User not found",
					});
				}

				if (!currentUser.enableEnterpriseFeatures) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Please activate enterprise features to validate license key",
					});
				}
				return await validateLicenseKey(input.licenseKey);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to validate license key",
				});
			}
		}),
	deactivate: adminProcedure
		.input(z.object({ licenseKey: z.string() }))
		.mutation(async ({ input }) => {
			try {
				const isValidLicenseKey = await validateLicenseKey(input.licenseKey);
				if (!isValidLicenseKey) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "License key is invalid",
					});
				}
				return await deactivateLicenseKey(input.licenseKey);
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to deactivate license key",
				});
			}
		}),
	getEnterpriseSettings: adminProcedure.query(async ({ ctx }) => {
		const currentUserId = ctx.user.id;
		const currentUser = await db.query.user.findFirst({
			where: eq(user.id, currentUserId),
		});

		if (!currentUser) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		return {
			enableEnterpriseFeatures: !!currentUser.enableEnterpriseFeatures,
			licenseKey: currentUser.licenseKey ?? "",
		};
	}),

	updateEnterpriseSettings: adminProcedure
		.input(
			z.object({
				enableEnterpriseFeatures: z.boolean().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			try {
				const currentUserId = ctx.user.id;

				if (input.enableEnterpriseFeatures === undefined) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "enableEnterpriseFeatures must be provided",
					});
				}

				await db
					.update(user)
					.set({
						enableEnterpriseFeatures: input.enableEnterpriseFeatures,
					})
					.where(eq(user.id, currentUserId));

				return true;
			} catch (error) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message:
						error instanceof Error
							? error.message
							: "Failed to update enterprise settings",
				});
			}
		}),
});
