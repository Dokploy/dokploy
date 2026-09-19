import { describe, expect, it } from "vitest";
import { matchesTagPattern, matchesTriggerTags } from "@/utils/tag-triggers";

describe("tag trigger patterns", () => {
	it.each([
		["go-1", "go-*", true],
		["go-v1.2.3", "go-*", true],
		["go", "go", true],
		["go-1", "go", false],
		["GO-1", "go-*", false],
		["other-go-1", "go-*", false],
		["go-", "go-*", true],
		["release/go/v1", "release/*/v*", true],
		["v1-prod", "*-prod", true],
		["v1-prod-extra", "*-prod", false],
		["ab", "ab*ab", false],
		["abab", "ab*ab", true],
		["anything", "*", true],
		["go-1", "go-**", true],
		["v1X2", "v1.2", false],
		["v1.2", "v1.2", true],
		["go-a", "go-[ab]", false],
		["go-1", "go-?", false],
		["release/go/v1", "*", true],
		["release/v1.2", "release/*", true],
		["go-v1.2", "go-*", true],
		["go-(1)", "go-(1)", true],
		["go-1", "go-(1)", false],
		["go-1", "go-@(1|2)", false],
		["go-1", "go-{1,2}", false],
		["!go-1", "!go-*", true],
		["node-1", "!go-*", false],
		["go+1", "go+*", true],
		["go1", "go+*", false],
	])("matches %s against %s: %s", (tag, pattern, expected) => {
		expect(matchesTagPattern(tag, pattern)).toBe(expected);
	});

	it("accepts all tags when no filter is configured", () => {
		for (const patterns of [undefined, null, []]) {
			expect(matchesTriggerTags("any-v1", patterns)).toBe(true);
		}
	});

	it("allows exact names and wildcards together", () => {
		expect(matchesTriggerTags("go", ["all-*", "go"])).toBe(true);
		expect(matchesTriggerTags("all-2", ["all-*", "go"])).toBe(true);
		expect(matchesTriggerTags("node-2", ["all-*", "go"])).toBe(false);
	});
});
