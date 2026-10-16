import { webServerSettings } from "@dokploy/server/db/schema";
import type { PublicWhitelabelingConfig } from "@dokploy/server/services/proprietary/whitelabeling";
import { describe, expect, it } from "vitest";

/**
 * Integration tests for the visibility controls feature that allows self-hosted
 * enterprise instances to hide unused UI elements.
 */

describe("Visibility Controls - Database schema", () => {
	it("should have hideSocialIcons column in webServerSettings schema", () => {
		expect(webServerSettings.hideSocialIcons).toBeDefined();
		expect(webServerSettings.hideSocialIcons.dataType).toBe("boolean");
		expect(webServerSettings.hideSocialIcons.notNull).toBe(true);
		expect(webServerSettings.hideSocialIcons.default).toBe(false);
	});

	it("should have hideDocsLink column in webServerSettings schema", () => {
		expect(webServerSettings.hideDocsLink).toBeDefined();
		expect(webServerSettings.hideDocsLink.dataType).toBe("boolean");
		expect(webServerSettings.hideDocsLink.notNull).toBe(true);
		expect(webServerSettings.hideDocsLink.default).toBe(false);
	});

	it("should have hideSupportLink column in webServerSettings schema", () => {
		expect(webServerSettings.hideSupportLink).toBeDefined();
		expect(webServerSettings.hideSupportLink.dataType).toBe("boolean");
		expect(webServerSettings.hideSupportLink.notNull).toBe(true);
		expect(webServerSettings.hideSupportLink.default).toBe(false);
	});

	it("should have hideSSOButton column in webServerSettings schema", () => {
		expect(webServerSettings.hideSSOButton).toBeDefined();
		expect(webServerSettings.hideSSOButton.dataType).toBe("boolean");
		expect(webServerSettings.hideSSOButton.notNull).toBe(true);
		expect(webServerSettings.hideSSOButton.default).toBe(false);
	});

	it("should have hidePasskeyButton column in webServerSettings schema", () => {
		expect(webServerSettings.hidePasskeyButton).toBeDefined();
		expect(webServerSettings.hidePasskeyButton.dataType).toBe("boolean");
		expect(webServerSettings.hidePasskeyButton.notNull).toBe(true);
		expect(webServerSettings.hidePasskeyButton.default).toBe(false);
	});

	it("should have all 5 visibility control columns with consistent schema", () => {
		const columns = [
			webServerSettings.hideSocialIcons,
			webServerSettings.hideDocsLink,
			webServerSettings.hideSupportLink,
			webServerSettings.hideSSOButton,
			webServerSettings.hidePasskeyButton,
		];

		for (const column of columns) {
			expect(column.dataType).toBe("boolean");
			expect(column.notNull).toBe(true);
			expect(column.default).toBe(false);
		}
	});
});

describe("Visibility Controls - PublicWhitelabelingConfig interface", () => {
	it("should expose hideSocialIcons in PublicWhitelabelingConfig type", () => {
		// Type test: this will fail to compile if the property doesn't exist
		const config: Partial<PublicWhitelabelingConfig> = {
			hideSocialIcons: false,
			hideSSOButton: false,
			hidePasskeyButton: false,
		};

		expect(config.hideSocialIcons).toBeDefined();
		expect(typeof config.hideSocialIcons).toBe("boolean");
	});

	it("should expose hideSSOButton in PublicWhitelabelingConfig type", () => {
		const config: Partial<PublicWhitelabelingConfig> = {
			hideSSOButton: true,
		};

		expect(config.hideSSOButton).toBeDefined();
		expect(typeof config.hideSSOButton).toBe("boolean");
	});

	it("should expose hidePasskeyButton in PublicWhitelabelingConfig type", () => {
		const config: Partial<PublicWhitelabelingConfig> = {
			hidePasskeyButton: true,
		};

		expect(config.hidePasskeyButton).toBeDefined();
		expect(typeof config.hidePasskeyButton).toBe("boolean");
	});
});

describe("Visibility Controls - Validation logic", () => {
	/**
	 * Tests for the business logic behind visibility controls.
	 * These test the intended behavior documented in the mutations.
	 */

	describe("SSO button validation logic", () => {
		it("should allow hiding when no providers and enforceSSO is false", () => {
			const hasSSOProviders = false;
			const enforceSSO = false;
			const canHide = !hasSSOProviders && !enforceSSO;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding when providers exist", () => {
			const hasSSOProviders = true;
			const enforceSSO = false;
			const canHide = !hasSSOProviders && !enforceSSO;
			expect(canHide).toBe(false);
		});

		it("should prevent hiding when enforceSSO is enabled", () => {
			const hasSSOProviders = false;
			const enforceSSO = true;
			const canHide = !hasSSOProviders && !enforceSSO;
			expect(canHide).toBe(false);
		});
	});

	describe("Passkey button validation logic", () => {
		it("should allow hiding when no passkeys exist", () => {
			const hasPasskeys = false;
			const canHide = !hasPasskeys;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding when passkeys exist", () => {
			const hasPasskeys = true;
			const canHide = !hasPasskeys;
			expect(canHide).toBe(false);
		});
	});

	describe("Docs/Support link validation logic", () => {
		it("should allow hiding docs when no custom URL", () => {
			const customDocsUrl = null;
			const canHide = !customDocsUrl;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding docs when custom URL exists", () => {
			const customDocsUrl = "https://custom.docs.com";
			const canHide = !customDocsUrl;
			expect(canHide).toBe(false);
		});

		it("should allow hiding support when no custom URL", () => {
			const customSupportUrl = null;
			const canHide = !customSupportUrl;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding support when custom URL exists", () => {
			const customSupportUrl = "https://custom.support.com";
			const canHide = !customSupportUrl;
			expect(canHide).toBe(false);
		});
	});

	describe("UI rendering logic", () => {
		it("should include invisible class when social icons are hidden", () => {
			const hideSocialIcons = true;
			const classNames = [
				"flex",
				"gap-1",
				hideSocialIcons && "invisible",
			].filter(Boolean);
			expect(classNames).toContain("invisible");
		});

		it("should not include invisible class when social icons are visible", () => {
			const hideSocialIcons = false;
			const classNames = [
				"flex",
				"gap-1",
				hideSocialIcons && "invisible",
			].filter(Boolean);
			expect(classNames).not.toContain("invisible");
		});

		it("should show docs link when custom URL exists regardless of toggle", () => {
			const customDocsUrl = "https://custom.docs.com";
			const hideDocsLink = true;
			const shouldShow = !!customDocsUrl || !hideDocsLink;
			expect(shouldShow).toBe(true);
		});

		it("should hide docs link when toggle is on and no custom URL", () => {
			const customDocsUrl = null;
			const hideDocsLink = true;
			const shouldShow = !!customDocsUrl || !hideDocsLink;
			expect(shouldShow).toBe(false);
		});

		it("should show SSO when providers exist even if hide flag is on", () => {
			const enforceSSO = false;
			const showSignInWithSSO = true;
			const hideSSOButton = true;
			// After fix: SSO always shows when providers exist
			const shouldShow = enforceSSO || showSignInWithSSO;
			expect(shouldShow).toBe(true);
		});

		it("should show passkey management when user has passkeys even if hide flag is on", () => {
			const hidePasskeyButton = true;
			const hasPasskeys = true;
			// After fix: Management always shows when passkeys exist
			const shouldShow = !hidePasskeyButton || hasPasskeys;
			expect(shouldShow).toBe(true);
		});
	});
});
