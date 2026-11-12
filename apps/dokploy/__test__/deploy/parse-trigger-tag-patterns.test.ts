import { describe, expect, it } from "vitest";
import { parseTriggerTagPatterns } from "@/utils/parse-trigger-tag-patterns";
import { matchesTriggerTags } from "@/utils/tag-triggers";

describe("parseTriggerTagPatterns", () => {
	it.each<[string, string[]]>([
		["{go,node}-*", ["{go,node}-*"]],
		["go-*, node-*", ["go-*", "node-*"]],
		["all-*, {go,node}-*", ["all-*", "{go,node}-*"]],
		["{go,{node,web}}-*, all-*", ["{go,{node,web}}-*", "all-*"]],
		["{go,node}-{prod,dev}-*", ["{go,node}-{prod,dev}-*"]],
		["v{1..3}, all-*", ["v{1..3}", "all-*"]],
		["", []],
		[" \t\n ", []],
		[", ,go-*,, node-*, ", ["go-*", "node-*"]],
		[" go-* , go-*, node-* ", ["go-*", "node-*"]],
		["{go,node}-*, {go,node}-*", ["{go,node}-*"]],
		["GO-*, go-*", ["GO-*", "go-*"]],
		["go, !node-*, release/*/v?", ["go", "!node-*", "release/*/v?"]],
		[String.raw`go\,node-*, all-*`, [String.raw`go\,node-*`, "all-*"]],
		[String.raw`go\\, node-*`, [String.raw`go\\`, "node-*"]],
		[String.raw`\{go,node\}-*`, [String.raw`\{go`, String.raw`node\}-*`]],
		[
			String.raw`{go\,api,node}-*, all-*`,
			[String.raw`{go\,api,node}-*`, "all-*"],
		],
		["v[1,2]-*, all-*", ["v[1,2]-*", "all-*"]],
		["[{,}]-*, all-*", ["[{,}]-*", "all-*"]],
		["@(go,node|web)-*, all-*", ["@(go,node|web)-*", "all-*"]],
		['"go,node"-*, all-*', ['"go,node"-*', "all-*"]],
		["go}-*, node-*", ["go}-*", "node-*"]],
		["{go,node-*", ["{go,node-*"]],
		["go-\\", ["go-\\"]],
	])("parses %j as %j", (input, expected) => {
		expect(parseTriggerTagPatterns(input)).toEqual(expected);
	});

	it.each([
		{ patterns: [] },
		{ patterns: ["all-*", "go-*"] },
		{ patterns: ["go", "!node-*", "release/*/v?"] },
		{ patterns: ["{go,node}-*", "all-*"] },
	])(
		"preserves saved patterns when reopening and saving: $patterns",
		({ patterns }) => {
			expect(parseTriggerTagPatterns(patterns.join(", "))).toEqual(patterns);
		},
	);

	it.each(["{go,node}-*", "go-*, node-*"])(
		"matches both services after parsing %s",
		(input) => {
			const patterns = parseTriggerTagPatterns(input);
			expect(matchesTriggerTags("go-1", patterns)).toBe(true);
			expect(matchesTriggerTags("node-2", patterns)).toBe(true);
			expect(matchesTriggerTags("web-1", patterns)).toBe(false);
		},
	);

	it("keeps empty input unrestricted", () => {
		expect(matchesTriggerTags("any-tag", parseTriggerTagPatterns(" , "))).toBe(
			true,
		);
	});
});
