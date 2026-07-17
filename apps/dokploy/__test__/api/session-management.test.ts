import { describe, expect, it } from "vitest";
import { z } from "zod";

const revokeSessionSchema = z.object({
	sessionId: z.string(),
});

describe("revokeSession input validation", () => {
	it("accepts a valid session id", () => {
		const result = revokeSessionSchema.safeParse({ sessionId: "abc123" });
		expect(result.success).toBe(true);
	});

	it("rejects missing sessionId", () => {
		const result = revokeSessionSchema.safeParse({});
		expect(result.success).toBe(false);
	});

	it("rejects non-string sessionId", () => {
		const result = revokeSessionSchema.safeParse({ sessionId: 123 });
		expect(result.success).toBe(false);
	});
});
