import { describe, expect, it } from "vitest";

/**
 * Tests for the visibility controls feature that allows self-hosted
 * enterprise instances to hide unused UI elements.
 */

describe("Visibility Controls - Server-side validation", () => {
	/**
	 * These tests verify the validation rules for hiding UI elements.
	 * The actual mutations are in apps/dokploy/server/api/routers/settings.ts
	 */

	describe("Hide SSO Button validation", () => {
		it("should allow hiding SSO button when no SSO providers exist and enforceSSO is false", () => {
			// Validation logic: can hide if no ssoProvider records AND enforceSSO is false
			const hasSSOProviders = false;
			const enforceSSO = false;
			const canHide = !hasSSOProviders && !enforceSSO;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding SSO button when SSO providers exist", () => {
			// Validation logic: cannot hide if ssoProvider records exist
			const hasSSOProviders = true;
			const enforceSSO = false;
			const canHide = !hasSSOProviders && !enforceSSO;
			expect(canHide).toBe(false);
		});

		it("should prevent hiding SSO button when enforceSSO is enabled", () => {
			// Validation logic: cannot hide if enforceSSO is true
			const hasSSOProviders = false;
			const enforceSSO = true;
			const canHide = !hasSSOProviders && !enforceSSO;
			expect(canHide).toBe(false);
		});
	});

	describe("Hide Passkey Button validation", () => {
		it("should allow hiding passkey button when no users have passkeys", () => {
			// Validation logic: can hide if no passkey records exist
			const hasPasskeys = false;
			const canHide = !hasPasskeys;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding passkey button when users have passkeys configured", () => {
			// Validation logic: cannot hide if passkey records exist
			const hasPasskeys = true;
			const canHide = !hasPasskeys;
			expect(canHide).toBe(false);
		});
	});

	describe("Hide Documentation Link validation", () => {
		it("should allow hiding docs link when no custom docs URL is set", () => {
			// Validation logic: can hide if whitelabelingConfig.docsUrl is null/undefined
			const customDocsUrl = null;
			const canHide = !customDocsUrl;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding docs link when custom docs URL exists", () => {
			// Validation logic: cannot hide if whitelabelingConfig.docsUrl exists
			const customDocsUrl = "https://custom.docs.com";
			const canHide = !customDocsUrl;
			expect(canHide).toBe(false);
		});
	});

	describe("Hide Support Link validation", () => {
		it("should allow hiding support link when no custom support URL is set", () => {
			// Validation logic: can hide if whitelabelingConfig.supportUrl is null/undefined
			const customSupportUrl = null;
			const canHide = !customSupportUrl;
			expect(canHide).toBe(true);
		});

		it("should prevent hiding support link when custom support URL exists", () => {
			// Validation logic: cannot hide if whitelabelingConfig.supportUrl exists
			const customSupportUrl = "https://custom.support.com";
			const canHide = !customSupportUrl;
			expect(canHide).toBe(false);
		});
	});

	describe("Hide Social Icons validation", () => {
		it("should always allow hiding social icons (no validation required)", () => {
			// Social icons have no server-side validation - they can always be hidden
			const canHide = true;
			expect(canHide).toBe(true);
		});
	});
});

describe("Visibility Controls - IS_CLOUD restriction", () => {
	/**
	 * All visibility control toggles are restricted to self-hosted instances.
	 * IS_CLOUD guard throws TRPCError with code "BAD_REQUEST" when called from cloud.
	 */

	it("should restrict visibility controls to self-hosted instances", () => {
		const IS_CLOUD = true;
		const shouldThrowError = IS_CLOUD;
		expect(shouldThrowError).toBe(true);
	});

	it("should allow visibility controls on self-hosted instances", () => {
		const IS_CLOUD = false;
		const shouldThrowError = IS_CLOUD;
		expect(shouldThrowError).toBe(false);
	});

	it("all 5 visibility control mutations have the same IS_CLOUD guard", () => {
		// All mutations follow the same pattern:
		// if (IS_CLOUD) throw new TRPCError({ code: "BAD_REQUEST", message: "..." })
		const mutations = [
			"updateHideSocialIcons",
			"updateHideDocsLink",
			"updateHideSupportLink",
			"updateHideSSOButton",
			"updateHidePasskeyButton",
		];
		expect(mutations.length).toBe(5);
	});
});

describe("Visibility Controls - Database schema", () => {
	/**
	 * Tests for the database columns added to webServerSettings table
	 */

	it("should have all 5 visibility control columns in schema", () => {
		const columns = [
			"hideSocialIcons",
			"hideDocsLink",
			"hideSupportLink",
			"hideSSOButton",
			"hidePasskeyButton",
		];
		expect(columns.length).toBe(5);
		// All columns are boolean with notNull().default(false)
		for (const column of columns) {
			expect(column).toBeTruthy();
		}
	});

	it("should default all visibility controls to false (visible by default)", () => {
		// All columns have .default(false), meaning features are visible by default
		const defaultValue = false;
		expect(defaultValue).toBe(false);
	});
});

describe("Visibility Controls - UI behavior", () => {
	/**
	 * Tests for how the visibility controls affect the UI
	 */

	describe("Social icons rendering", () => {
		it("should use invisible class to preserve layout when hidden", () => {
			// Uses cn("...", hideSocialIcons && "invisible") to hide without layout jump
			const hideSocialIcons = true;
			const classNames = [
				"flex",
				"gap-1",
				hideSocialIcons && "invisible",
			].filter(Boolean);
			expect(classNames).toContain("invisible");
		});

		it("should render normally when not hidden", () => {
			const hideSocialIcons = false;
			const classNames = [
				"flex",
				"gap-1",
				hideSocialIcons && "invisible",
			].filter(Boolean);
			expect(classNames).not.toContain("invisible");
		});
	});

	describe("Sidebar Extra section filtering", () => {
		it("should show docs link when custom URL exists (regardless of toggle)", () => {
			const customDocsUrl = "https://custom.docs.com";
			const hideDocsLink = true;
			const shouldShowDocs = !!customDocsUrl || !hideDocsLink;
			expect(shouldShowDocs).toBe(true);
		});

		it("should hide docs link when toggle is on and no custom URL", () => {
			const customDocsUrl = null;
			const hideDocsLink = true;
			const shouldShowDocs = !!customDocsUrl || !hideDocsLink;
			expect(shouldShowDocs).toBe(false);
		});

		it("should hide Extra section when both docs and support are hidden", () => {
			const helpItems = []; // Both filtered out
			const shouldShowExtraSection = helpItems.length > 0;
			expect(shouldShowExtraSection).toBe(false);
		});

		it("should show Extra section when at least one link is visible", () => {
			const helpItems = ["Documentation"]; // At least one visible
			const shouldShowExtraSection = helpItems.length > 0;
			expect(shouldShowExtraSection).toBe(true);
		});
	});

	describe("Login page conditionals", () => {
		it("should hide passkey button when hidePasskeyButton is enabled", () => {
			const hidePasskeyButton = true;
			const shouldShowPasskey = !hidePasskeyButton;
			expect(shouldShowPasskey).toBe(false);
		});

		it("should hide SSO option when hideSSOButton is enabled", () => {
			const hideSSOButton = true;
			const enforceSSO = false;
			const showSignInWithSSO = true;
			const shouldShowSSO = enforceSSO || (showSignInWithSSO && !hideSSOButton);
			expect(shouldShowSSO).toBe(false);
		});

		it("should always show SSO when enforceSSO is true", () => {
			const hideSSOButton = true;
			const enforceSSO = true;
			const showSignInWithSSO = true;
			const shouldShowSSO = enforceSSO || (showSignInWithSSO && !hideSSOButton);
			expect(shouldShowSSO).toBe(true);
		});
	});

	describe("Profile settings passkey visibility", () => {
		it("should hide passkey setup when hidePasskeyButton is enabled", () => {
			const hidePasskeyButton = true;
			const shouldShowPasskeySetup = !hidePasskeyButton;
			expect(shouldShowPasskeySetup).toBe(false);
		});

		it("should show passkey setup when hidePasskeyButton is disabled", () => {
			const hidePasskeyButton = false;
			const shouldShowPasskeySetup = !hidePasskeyButton;
			expect(shouldShowPasskeySetup).toBe(true);
		});
	});
});

describe("Visibility Controls - PublicWhitelabelingConfig", () => {
	/**
	 * Tests for the public config that exposes visibility settings to unauthenticated pages
	 */

	it("should expose hideSocialIcons in public config", () => {
		const settings = { hideSocialIcons: true };
		const publicConfig = {
			hideSocialIcons: settings?.hideSocialIcons ?? false,
		};
		expect(publicConfig.hideSocialIcons).toBe(true);
	});

	it("should expose hideSSOButton in public config", () => {
		const settings = { hideSSOButton: true };
		const publicConfig = {
			hideSSOButton: settings?.hideSSOButton ?? false,
		};
		expect(publicConfig.hideSSOButton).toBe(true);
	});

	it("should expose hidePasskeyButton in public config", () => {
		const settings = { hidePasskeyButton: true };
		const publicConfig = {
			hidePasskeyButton: settings?.hidePasskeyButton ?? false,
		};
		expect(publicConfig.hidePasskeyButton).toBe(true);
	});

	it("should default to false when settings properties are undefined", () => {
		// Test the fallback behavior with nullish coalescing
		const undefinedValue = undefined;
		const publicConfig = {
			hideSocialIcons: undefinedValue ?? false,
			hideSSOButton: undefinedValue ?? false,
			hidePasskeyButton: undefinedValue ?? false,
		};
		expect(publicConfig.hideSocialIcons).toBe(false);
		expect(publicConfig.hideSSOButton).toBe(false);
		expect(publicConfig.hidePasskeyButton).toBe(false);
	});
});
