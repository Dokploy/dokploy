import { user } from "@dokploy/server/db/schema";
import { validateLicenseKey } from "@dokploy/server/index";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";
import {
	activateLicenseKey,
	deactivateLicenseKey,
} from "@/server/utils/enterprise";

export const licenseKeyRouter = createTRPCRouter({
	activate: adminProcedure
		.input(z.object({ licenseKey: z.string().min(1) }))
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

				if (ctx.user.role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not authorized to activate a license key",
					});
				}

				if (!currentUser.enableEnterpriseFeatures) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							"Please activate enterprise features to activate license key",
					});
				}

				await activateLicenseKey(input.licenseKey);
				await db
					.update(user)
					.set({
						licenseKey: input.licenseKey,
						isValidEnterpriseLicense: true,
					})
					.where(eq(user.id, currentUserId));
				return { success: true };
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
	validate: adminProcedure.mutation(async ({ ctx }) => {
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

			if (ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to validate a license key",
				});
			}

			if (!currentUser.licenseKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No license key found",
				});
			}

			if (!currentUser.enableEnterpriseFeatures) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"Please activate enterprise features to validate license key",
				});
			}
			const valid = await validateLicenseKey(currentUser.licenseKey);
			if (valid) {
				await db
					.update(user)
					.set({ isValidEnterpriseLicense: true })
					.where(eq(user.id, currentUserId));
			}
			return valid;
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
	deactivate: adminProcedure.mutation(async ({ ctx }) => {
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
			if (!currentUser.licenseKey) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "No license key found",
				});
			}

			if (ctx.user.role !== "owner") {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "You are not authorized to deactivate a license key",
				});
			}

			await deactivateLicenseKey(currentUser.licenseKey);
			await db
				.update(user)
				.set({
					licenseKey: null,
					isValidEnterpriseLicense: false,
				})
				.where(eq(user.id, currentUserId));
			return { success: true };
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

		if (ctx.user.role !== "owner") {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: "You are not authorized to get enterprise settings",
			});
		}

		return {
			enableEnterpriseFeatures: !!currentUser.enableEnterpriseFeatures,
			licenseKey: currentUser.licenseKey ?? "",
		};
	}),
	haveValidLicenseKey: adminProcedure.query(async ({ ctx }) => {
		const currentUserId = ctx.user.id;
		const currentUser = await db.query.user.findFirst({
			where: eq(user.id, currentUserId),
			columns: {
				enableEnterpriseFeatures: true,
				isValidEnterpriseLicense: true,
			},
		});
		return !!(
			currentUser?.enableEnterpriseFeatures &&
			currentUser?.isValidEnterpriseLicense
		);
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

				if (ctx.user.role !== "owner") {
					throw new TRPCError({
						code: "FORBIDDEN",
						message: "You are not authorized to update enterprise settings",
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
