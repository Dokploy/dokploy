import { describe, expect, it } from "vitest";
import { isVersionAtLeast } from "@/lib/version";

describe("isVersionAtLeast", () => {
	it("accepts the requested version and newer versions", () => {
		expect(isVersionAtLeast("0.37.0", "v0.37.0")).toBe(true);
		expect(isVersionAtLeast("v0.37.1", "0.37.0")).toBe(true);
	});

	it("rejects the old version that may still answer health checks", () => {
		expect(isVersionAtLeast("0.36.2", "v0.37.0")).toBe(false);
	});

	it("rejects missing or invalid versions", () => {
		expect(isVersionAtLeast("", "v0.37.0")).toBe(false);
		expect(isVersionAtLeast("0.37.0", "latest")).toBe(false);
	});
});
