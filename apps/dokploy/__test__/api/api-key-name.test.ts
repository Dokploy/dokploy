import { describe, expect, it } from "vitest";
import {
	API_KEY_NAME_MAX_LENGTH,
	apiKeyNameSchema,
	canCreateApiKeyForAnotherUser,
} from "@/lib/api-keys";

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

describe("canCreateApiKeyForAnotherUser", () => {
	it("allows owners and admins", () => {
		expect(canCreateApiKeyForAnotherUser("owner")).toBe(true);
		expect(canCreateApiKeyForAnotherUser("admin")).toBe(true);
	});

	it("refuses a plain member, who may still mint for themselves", () => {
		expect(canCreateApiKeyForAnotherUser("member")).toBe(false);
	});

	it("refuses an absent role instead of defaulting to allowed", () => {
		expect(canCreateApiKeyForAnotherUser(undefined)).toBe(false);
		expect(canCreateApiKeyForAnotherUser(null)).toBe(false);
		expect(canCreateApiKeyForAnotherUser("")).toBe(false);
	});
});
