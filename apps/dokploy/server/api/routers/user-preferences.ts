import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { db } from "@dokploy/server/db";
import { userPreferences } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

export const userPreferencesRouter = createTRPCRouter({
	get: protectedProcedure.query(async ({ ctx }) => {
		const preferences = await db.query.userPreferences.findFirst({
			where: eq(userPreferences.userId, ctx.user.id),
		});

		// Return default preferences if none exist
		if (!preferences) {
			return {
				preferenceId: "",
				userId: ctx.user.id,
				hiddenSidebarItems: [],
				createdAt: new Date().toISOString(),
				updatedAt: null,
			};
		}

		return preferences;
	}),

	update: protectedProcedure
		.input(
			z.object({
				hiddenSidebarItems: z.array(z.string()),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Check if preferences exist
			const existing = await db.query.userPreferences.findFirst({
				where: eq(userPreferences.userId, ctx.user.id),
			});

			if (existing) {
				// Update existing preferences
				const updated = await db
					.update(userPreferences)
					.set({
						hiddenSidebarItems: input.hiddenSidebarItems,
					})
					.where(eq(userPreferences.userId, ctx.user.id))
					.returning();

				return updated[0];
			}

			// Create new preferences
			const created = await db
				.insert(userPreferences)
				.values({
					userId: ctx.user.id,
					hiddenSidebarItems: input.hiddenSidebarItems,
				})
				.returning();

			return created[0];
		}),

	toggleSidebarItem: protectedProcedure
		.input(
			z.object({
				itemKey: z.string(),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			// Get current preferences
			const current = await db.query.userPreferences.findFirst({
				where: eq(userPreferences.userId, ctx.user.id),
			});

			const currentHidden = (current?.hiddenSidebarItems as string[]) || [];
			const isHidden = currentHidden.includes(input.itemKey);

			// Toggle the item
			const newHidden = isHidden
				? currentHidden.filter((key) => key !== input.itemKey)
				: [...currentHidden, input.itemKey];

			if (current) {
				// Update existing
				const updated = await db
					.update(userPreferences)
					.set({
						hiddenSidebarItems: newHidden,
					})
					.where(eq(userPreferences.userId, ctx.user.id))
					.returning();

				return updated[0];
			}

			// Create new
			const created = await db
				.insert(userPreferences)
				.values({
					userId: ctx.user.id,
					hiddenSidebarItems: newHidden,
				})
				.returning();

			return created[0];
		}),
});
