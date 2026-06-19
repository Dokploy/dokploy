import { db } from "@dokploy/server/db";
import { webServerSettings } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

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

type WhitelabelingConfig = NonNullable<
	(typeof webServerSettings.$inferSelect)["whitelabelingConfig"]
>;

/**
 * Returns the whitelabeling config with each section's values applied only when
 * that section is enabled. Disabled sections have their values nulled out so
 * consumers (login page, document head, sidebar, error pages) don't apply them.
 *
 * The raw config (with the enable flags) is still used by the settings form so
 * values are preserved when a section is toggled off.
 */
export const getEffectiveWhitelabelingConfig = (
	config: WhitelabelingConfig | null | undefined,
): WhitelabelingConfig | null => {
	if (!config) return null;

	const branding = config.brandingEnabled === true;
	const appearance = config.appearanceEnabled === true;
	const metadata = config.metadataEnabled === true;
	const errorPages = config.errorPagesEnabled === true;
	const forgotPassword = config.forgotPasswordEnabled === true;

	return {
		...config,
		// Branding
		appName: branding ? config.appName : null,
		appDescription: branding ? config.appDescription : null,
		logoUrl: branding ? config.logoUrl : null,
		loginLogoUrl: branding ? config.loginLogoUrl : null,
		faviconUrl: branding ? config.faviconUrl : null,
		// Appearance
		customCss: appearance ? config.customCss : null,
		// Metadata & Links
		metaTitle: metadata ? config.metaTitle : null,
		metaDescription: metadata ? config.metaDescription : null,
		ogImageUrl: metadata ? config.ogImageUrl : null,
		footerText: metadata ? config.footerText : null,
		supportUrl: metadata ? config.supportUrl : null,
		docsUrl: metadata ? config.docsUrl : null,
		// Error Pages
		errorPageTitle: errorPages ? config.errorPageTitle : null,
		errorPageDescription: errorPages ? config.errorPageDescription : null,
		// Forgot Password
		passwordResetGuide: forgotPassword ? config.passwordResetGuide : null,
		supportEmail: forgotPassword ? config.supportEmail : null,
	};
};
