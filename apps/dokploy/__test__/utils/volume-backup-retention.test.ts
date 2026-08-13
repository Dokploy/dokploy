import { describe, expect, test } from "vitest";
import { prepareKeepLatestCount } from "@/components/dashboard/application/volume-backups/utils";

describe("prepareKeepLatestCount", () => {
	test("keeps the retention amount when a value is entered", () => {
		expect(prepareKeepLatestCount("3", 3)).toBe(3);
		expect(prepareKeepLatestCount("10", 10)).toBe(10);
	});

	test("returns null when the field is cleared", () => {
		expect(prepareKeepLatestCount("", undefined)).toBeNull();
		expect(prepareKeepLatestCount("   ", undefined)).toBeNull();
	});

	test("returns null instead of undefined so the column is cleared", () => {
		// `undefined` is dropped from the update statement, which would leave the
		// previously stored retention in place. See issue #4184.
		expect(prepareKeepLatestCount("", 3)).not.toBeUndefined();
		expect(prepareKeepLatestCount("", 3)).toBeNull();
	});

	test("normalizes a missing form value to null", () => {
		expect(prepareKeepLatestCount("3", undefined)).toBeNull();
		expect(prepareKeepLatestCount("3", null)).toBeNull();
	});
});
