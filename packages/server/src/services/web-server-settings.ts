import { db } from "@dokploy/server/db";
import { webServerSettings } from "@dokploy/server/db/schema";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Get the web server settings (singleton - only one row should exist)
 */
export const getWebServerSettings = async () => {
	const settings = await db.query.webServerSettings.findFirst({
		orderBy: (settings, { asc }) => [asc(settings.createdAt)],
	});

	if (!settings) {
		// Create default settings if none exist
		const [newSettings] = await db
			.insert(webServerSettings)
			.values({})
			.returning();

		return newSettings;
	}

	return settings;
};

/**
 * Update web server settings
 */
export const updateWebServerSettings = async (
	updates: Partial<typeof webServerSettings.$inferInsert>,
) => {
	const current = await getWebServerSettings();

	const [updated] = await db
		.update(webServerSettings)
		.set({
			...updates,
			updatedAt: new Date(),
		})
		.where(eq(webServerSettings.id, current?.id ?? ""))
		.returning();

	return updated;
};

export const claimWebServerLogManagement = async (
	organizationId: string,
	enableLogManagement: boolean,
) => {
	const current = await getWebServerSettings();
	if (!current) {
		return null;
	}

	const [updated] = await db
		.update(webServerSettings)
		.set({
			enableLogManagement,
			logManagementOrganizationId: enableLogManagement ? organizationId : null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(webServerSettings.id, current.id),
				or(
					isNull(webServerSettings.logManagementOrganizationId),
					eq(webServerSettings.logManagementOrganizationId, organizationId),
				),
			),
		)
		.returning();

	return updated ?? null;
};
