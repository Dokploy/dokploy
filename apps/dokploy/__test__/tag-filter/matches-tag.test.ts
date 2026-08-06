import { matchesTag } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("matchesTag", () => {
	it("deploys on any tag when filter is empty", () => {
		expect(matchesTag(null, "web-v1.0.0")).toBe(true);
		expect(matchesTag(undefined, "web-v1.0.0")).toBe(true);
		expect(matchesTag("", "web-v1.0.0")).toBe(true);
	});

	it("matches a simple glob prefix", () => {
		expect(matchesTag("web-*", "web-v0.7.1")).toBe(true);
		expect(matchesTag("web-*", "api-v0.5.1")).toBe(false);
	});

	it("matches a brace-expansion glob for multiple prefixes", () => {
		expect(matchesTag("{web-*,shared-*}", "web-v0.7.1")).toBe(true);
		expect(matchesTag("{web-*,shared-*}", "shared-v0.5.1")).toBe(true);
		expect(matchesTag("{web-*,shared-*}", "api-v0.5.1")).toBe(false);
	});

	it("does not match an unrelated tag name", () => {
		expect(matchesTag("api-v*", "web-v0.7.1")).toBe(false);
	});
});
