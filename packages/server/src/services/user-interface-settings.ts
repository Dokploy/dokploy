import { db } from "@dokploy/server/db";
import { userInterfaceSettings } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

/**
 * Get the user interface settings (singleton - only one row should exist)
 */
export const getUserInterfaceSettings = async () => {
	const settings = await db.query.userInterfaceSettings.findFirst({
		orderBy: (settings, { asc }) => [asc(settings.createdAt)],
	});

	if (!settings) {
		// Create default settings if none exist
		const [newSettings] = await db
			.insert(userInterfaceSettings)
			.values({})
			.returning();

		return newSettings;
	}

	return settings;
};

/**
 * Update user interface settings
 */
export const updateUserInterfaceSettings = async (
	updates: Partial<typeof userInterfaceSettings.$inferInsert>,
) => {
	const current = await getUserInterfaceSettings();

	const [updated] = await db
		.update(userInterfaceSettings)
		.set({
			...updates,
			updatedAt: new Date(),
		})
		.where(eq(userInterfaceSettings.id, current?.id ?? ""))
		.returning();

	return updated;
};