import { describe, expect, it } from "vitest";
import { API_KEY_NAME_MAX_LENGTH, apiKeyNameSchema } from "@/lib/api-keys";

describe("apiKeyNameSchema", () => {
	it("rejects an empty name", () => {
		const result = apiKeyNameSchema.safeParse("");
		expect(result.success).toBe(false);
	});

	it("accepts a name at the maximum length", () => {
		const name = "a".repeat(API_KEY_NAME_MAX_LENGTH);
		const result = apiKeyNameSchema.safeParse(name);
		expect(result.success).toBe(true);
	});

	it("rejects a name over the maximum length instead of passing it to better-auth", () => {
		const name = "a".repeat(API_KEY_NAME_MAX_LENGTH + 1);
		const result = apiKeyNameSchema.safeParse(name);
		expect(result.success).toBe(false);
		if (!result.success) {
			expect(result.error.issues[0]?.message).toBe(
				`Name must be at most ${API_KEY_NAME_MAX_LENGTH} characters`,
			);
		}
	});
});
