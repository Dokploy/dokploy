import { user } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "@/server/api/trpc";
import { db } from "@/server/db";

export const licenseKeyRouter = createTRPCRouter({
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
				licenseKey: z.string().optional(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const currentUserId = ctx.user.id;

			if (
				input.enableEnterpriseFeatures === undefined &&
				input.licenseKey === undefined
			) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message:
						"At least one of enableEnterpriseFeatures or licenseKey must be provided",
				});
			}

			await db
				.update(user)
				.set({
					// enableEnterpriseFeatures: input.enableEnterpriseFeatures ?? false,
					licenseKey: input.licenseKey ?? "",
				})
				.where(eq(user.id, currentUserId));

			return true;
		}),
});
