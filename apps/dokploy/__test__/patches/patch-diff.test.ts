import { describe, expect, it } from "vitest";
import { buildDiffHunks } from "@/lib/patch-diff";

describe("buildDiffHunks", () => {
	it("marks inserted lines", () => {
		const hunks = buildDiffHunks("a\nb", "a\nb\nc");

		expect(hunks).toEqual([
			{
				type: "equal",
				originalStart: 0,
				currentStart: 0,
				originalLines: ["a", "b"],
				currentLines: ["a", "b"],
			},
			{
				type: "insert",
				originalStart: 2,
				currentStart: 2,
				currentLines: ["c"],
			},
		]);
	});

	it("marks deleted lines", () => {
		const hunks = buildDiffHunks("a\nb\nc", "a\nc");

		expect(hunks).toEqual([
			{
				type: "equal",
				originalStart: 0,
				currentStart: 0,
				originalLines: ["a"],
				currentLines: ["a"],
			},
			{
				type: "delete",
				originalStart: 1,
				currentStart: 1,
				originalLines: ["b"],
			},
			{
				type: "equal",
				originalStart: 2,
				currentStart: 1,
				originalLines: ["c"],
				currentLines: ["c"],
			},
		]);
	});

	it("coalesces replaced blocks", () => {
		const hunks = buildDiffHunks("a\nb\nc", "a\nx\ny\nc");

		expect(hunks).toEqual([
			{
				type: "equal",
				originalStart: 0,
				currentStart: 0,
				originalLines: ["a"],
				currentLines: ["a"],
			},
			{
				type: "replace",
				originalStart: 1,
				currentStart: 1,
				originalLines: ["b"],
				currentLines: ["x", "y"],
			},
			{
				type: "equal",
				originalStart: 2,
				currentStart: 3,
				originalLines: ["c"],
				currentLines: ["c"],
			},
		]);
	});
});
