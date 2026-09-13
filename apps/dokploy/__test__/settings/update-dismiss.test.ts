import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	clearDismissedUpdateVersion,
	DISMISSED_UPDATE_KEY,
	dismissUpdateVersion,
	isUpdateDismissed,
	shouldShowUpdate,
} from "../../lib/update";

describe("Update Dismissal Helpers", () => {
	const mockStorage: Record<string, string> = {};

	beforeEach(() => {
		// Clear mock storage before each test
		for (const key of Object.keys(mockStorage)) {
			delete mockStorage[key];
		}

		// Mock global localStorage
		global.localStorage = {
			getItem: (key: string) => mockStorage[key] ?? null,
			setItem: (key: string, value: string) => {
				mockStorage[key] = String(value);
			},
			removeItem: (key: string) => {
				delete mockStorage[key];
			},
			clear: () => {
				for (const key of Object.keys(mockStorage)) {
					delete mockStorage[key];
				}
			},
			length: 0,
			key: (_index: number) => null,
		};
	});

	afterEach(() => {
		clearDismissedUpdateVersion();
	});

	it("should return false when no update has been dismissed", () => {
		expect(isUpdateDismissed("v0.30.5")).toBe(false);
		expect(isUpdateDismissed(null)).toBe(false);
		expect(isUpdateDismissed(undefined)).toBe(false);
		expect(isUpdateDismissed("")).toBe(false);
	});

	it("should correctly record and check dismissed update version", () => {
		dismissUpdateVersion("v0.30.5");
		expect(mockStorage[DISMISSED_UPDATE_KEY]).toBe("v0.30.5");
		expect(isUpdateDismissed("v0.30.5")).toBe(true);
	});

	it("should NOT dismiss newer versions when a previous version was dismissed", () => {
		dismissUpdateVersion("v0.30.5");
		expect(isUpdateDismissed("v0.30.5")).toBe(true);

		// When v0.30.6 is released, it is not dismissed
		expect(isUpdateDismissed("v0.30.6")).toBe(false);
		expect(isUpdateDismissed("v0.31.0")).toBe(false);
	});

	it("should clear the dismissed update version when requested", () => {
		dismissUpdateVersion("v0.30.5");
		expect(isUpdateDismissed("v0.30.5")).toBe(true);

		clearDismissedUpdateVersion();
		expect(mockStorage[DISMISSED_UPDATE_KEY]).toBeUndefined();
		expect(isUpdateDismissed("v0.30.5")).toBe(false);
	});

	describe("shouldShowUpdate logic", () => {
		it("should return false if updateAvailable is false", () => {
			expect(shouldShowUpdate(false, "v0.30.5")).toBe(false);
			expect(shouldShowUpdate(false, null)).toBe(false);
		});

		it("should return false if latestVersion is missing", () => {
			expect(shouldShowUpdate(true, null)).toBe(false);
			expect(shouldShowUpdate(true, undefined)).toBe(false);
			expect(shouldShowUpdate(true, "")).toBe(false);
		});

		it("should return true when update is available and not dismissed", () => {
			expect(shouldShowUpdate(true, "v0.30.5")).toBe(true);
		});

		it("should return false when the available update is dismissed", () => {
			dismissUpdateVersion("v0.30.5");
			expect(shouldShowUpdate(true, "v0.30.5")).toBe(false);
		});

		it("should return true when a new version is released after dismissing a previous one", () => {
			dismissUpdateVersion("v0.30.5");
			// Old version dismissed
			expect(shouldShowUpdate(true, "v0.30.5")).toBe(false);

			// New version released
			expect(shouldShowUpdate(true, "v0.30.6")).toBe(true);
		});

		it("should gracefully handle localStorage exceptions without throwing", () => {
			global.localStorage.getItem = () => {
				throw new Error("SecurityError: Access denied");
			};
			global.localStorage.setItem = () => {
				throw new Error("QuotaExceededError");
			};
			global.localStorage.removeItem = () => {
				throw new Error("SecurityError: Access denied");
			};

			expect(() => dismissUpdateVersion("v0.30.5")).not.toThrow();
			expect(isUpdateDismissed("v0.30.5")).toBe(false);
			expect(() => clearDismissedUpdateVersion()).not.toThrow();
			expect(shouldShowUpdate(true, "v0.30.5")).toBe(true);
		});
	});
});
