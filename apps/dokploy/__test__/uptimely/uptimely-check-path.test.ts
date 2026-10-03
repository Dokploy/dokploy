import { uptimelyCheckPathSchema } from "@dokploy/server/db/schema/uptimely";
import { describe, expect, it } from "vitest";
import { checkPathError } from "@/components/dashboard/monitoring/uptimely/uptimely-panel-helpers";

const accepts = ["/health", "/api/v1/ping", "/", "/status?probe=1", "/a-b_c.d~e"];
const rejects: [string, string][] = [
	["health", "no leading slash"],
	["", "empty"],
	["//evil.com", "protocol-relative host"],
	["//evil.com/health", "protocol-relative host with path"],
	["https://x", "scheme and host"],
	["http://x/health", "scheme and host"],
	[" /a", "leading whitespace"],
	["/a b", "inner whitespace"],
	["/a\tb", "tab"],
	["/a\nb", "newline"],
	["/\\evil.com", "backslash read as a slash by browsers"],
	["/a#frag", "fragment"],
	["/café", "non-ASCII"],
	[`/${"a".repeat(200)}`, "over 200 characters"],
];

describe("uptimelyCheckPathSchema (server)", () => {
	it.each(accepts)("accepts %s", (value) => {
		expect(uptimelyCheckPathSchema.safeParse(value).success).toBe(true);
	});

	it.each(rejects)("rejects %j (%s)", (value) => {
		expect(uptimelyCheckPathSchema.safeParse(value).success).toBe(false);
	});

	it("accepts exactly 200 characters", () => {
		expect(
			uptimelyCheckPathSchema.safeParse(`/${"a".repeat(199)}`).success,
		).toBe(true);
	});
});

describe("checkPathError (client mirror)", () => {
	it("treats empty as valid (no path)", () => {
		expect(checkPathError("")).toBeNull();
	});

	it.each(accepts)("agrees with the server on %s", (value) => {
		expect(checkPathError(value)).toBeNull();
	});

	it.each(rejects.filter(([value]) => value !== ""))(
		"agrees with the server on %j (%s)",
		(value) => {
			expect(checkPathError(value)).toEqual(expect.any(String));
		},
	);
});
