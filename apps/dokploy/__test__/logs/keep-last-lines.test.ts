import { describe, expect, it } from "vitest";
import { keepLastLines } from "@/components/dashboard/docker/logs/utils";

describe("keepLastLines", () => {
	it("returns text unchanged when under the limit", () => {
		expect(keepLastLines("a\nb\n", 3)).toEqual({ text: "a\nb\n", trimmed: 0 });
	});

	it("keeps exactly the last N lines with a trailing newline", () => {
		expect(keepLastLines("a\nb\nc\nd\n", 2)).toEqual({
			text: "c\nd\n",
			trimmed: 2,
		});
	});

	it("handles a partial last line", () => {
		expect(keepLastLines("a\nb\nc", 2)).toEqual({ text: "b\nc", trimmed: 1 });
	});

	it("is a no-op at exactly the limit", () => {
		expect(keepLastLines("a\nb\n", 2).trimmed).toBe(0);
	});
});
