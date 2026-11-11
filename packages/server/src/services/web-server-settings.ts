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

	if (
		updates.host !== undefined ||
		updates.https !== undefined ||
		updates.serverIp !== undefined
	) {
		const { reconcileAzureDevopsHooks } = await import("./azure-devops-hooks");
		void reconcileAzureDevopsHooks().catch(() =>
			console.error("Azure DevOps hooks will be retried after the URL change."),
		);
	}
	return updated;
};

export const setWebServerProviderIds = async (
	organizationId: string,
	ids: string[],
) => {
	const current = await getWebServerSettings();
	if (!current) {
		return null;
	}

	const [updated] = await db
		.update(webServerSettings)
		.set({
			telemetryProviderIds: ids,
			vectorAgentOrganizationId: ids.length > 0 ? organizationId : null,
			updatedAt: new Date(),
		})
		.where(
			and(
				eq(webServerSettings.id, current.id),
				or(
					isNull(webServerSettings.vectorAgentOrganizationId),
					eq(webServerSettings.vectorAgentOrganizationId, organizationId),
				),
			),
		)
		.returning();

	return updated ?? null;
};

export const releaseWebServerAgent = async (organizationId: string) => {
	await db
		.update(webServerSettings)
		.set({
			telemetryProviderIds: [],
			vectorAgentOrganizationId: null,
			updatedAt: new Date(),
		})
		.where(eq(webServerSettings.vectorAgentOrganizationId, organizationId));
};
