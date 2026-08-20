import { prepareKeepLatestCount } from "@/components/dashboard/application/volume-backups/keep-latest-count";
import { describe, expect, test } from "vitest";

describe("prepareKeepLatestCount (#4184)", () => {
	// Clearing the "Keep Latest Backups" field must reset the retention to
	// unlimited. It has to send `null` (not `undefined`) so the column is
	// actually written: drizzle's .set() silently drops `undefined` keys, so
	// `undefined` would leave the previous value untouched.
	test("returns null when the field is cleared, even with a previous value", () => {
		expect(prepareKeepLatestCount("", 5)).toBeNull();
	});

	test("returns null for whitespace-only input", () => {
		expect(prepareKeepLatestCount("   ", 5)).toBeNull();
	});

	test("returns null when cleared with no previous value", () => {
		expect(prepareKeepLatestCount("", undefined)).toBeNull();
	});

	test("returns the numeric value when a limit is set", () => {
		expect(prepareKeepLatestCount("3", 3)).toBe(3);
	});

	// Guard against the original bug: the result must never be `undefined`,
	// otherwise the retention can never be turned off once set.
	test("never returns undefined", () => {
		expect(prepareKeepLatestCount("", 5)).not.toBeUndefined();
		expect(prepareKeepLatestCount("", undefined)).not.toBeUndefined();
	});
});
