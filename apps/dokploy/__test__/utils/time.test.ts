import { getUtcOffset } from "@/server/utils/time";
import { describe, expect, test } from "vitest";

describe("getUtcOffset", () => {
	test("should return correct offset for major timezones", () => {
		expect(getUtcOffset("UTC")).toBe("UTC+00:00");
		expect(getUtcOffset("Etc/UTC")).toBe("UTC+00:00");
		expect(getUtcOffset("Asia/Tokyo")).toBe("UTC+09:00");
		expect(getUtcOffset("Europe/Berlin")).toMatch(/UTC\+0[12]:00/);
	});

	test("should return correct offset for negative timezones", () => {
		expect(getUtcOffset("America/New_York")).toMatch(/UTC-0[45]:00/);
		expect(getUtcOffset("America/Los_Angeles")).toMatch(/UTC-0[78]:00/);
		expect(getUtcOffset("Pacific/Honolulu")).toBe("UTC-10:00");
	});

	test("should handle half-hour and quarter-hour offsets", () => {
		expect(getUtcOffset("Asia/Kolkata")).toBe("UTC+05:30");
		expect(getUtcOffset("Asia/Kathmandu")).toBe("UTC+05:45");
		expect(getUtcOffset("Pacific/Marquesas")).toBe("UTC-09:30");
	});

	test("should handle edge case timezones", () => {
		expect(getUtcOffset("Pacific/Kiritimati")).toBe("UTC+14:00");
		expect(getUtcOffset("Pacific/Niue")).toBe("UTC-11:00");
	});

	test("should return fallback for invalid timezone", () => {
		expect(getUtcOffset("Invalid/Timezone")).toBe("UTC+00:00");
		expect(getUtcOffset("")).toBe("UTC+00:00");
		expect(getUtcOffset("NotATimezone")).toBe("UTC+00:00");
	});

	test("should format output consistently", () => {
		const offset = getUtcOffset("Asia/Tokyo");
		expect(offset).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
		expect(offset).not.toContain("GMT");
	});
});
