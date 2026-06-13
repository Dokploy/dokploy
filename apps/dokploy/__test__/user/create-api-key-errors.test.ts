import { describe, expect, it } from "vitest";
import {
	apiKeyPrefixErrorMessage,
	getCreateApiKeyErrorMessage,
	getCreateApiKeyPrefixError,
} from "@/components/dashboard/settings/api/api-key-errors";

describe("create API key error helpers", () => {
	it("extracts prefix validation errors from tRPC zod errors", () => {
		const error = {
			data: {
				zodError: {
					fieldErrors: {
						prefix: [apiKeyPrefixErrorMessage],
					},
				},
			},
			message: "Invalid input",
		};

		expect(getCreateApiKeyPrefixError(error)).toBe(apiKeyPrefixErrorMessage);
		expect(getCreateApiKeyErrorMessage(error)).toBe(apiKeyPrefixErrorMessage);
	});

	it("treats server-side prefix validation as a field error", () => {
		const error = {
			message: apiKeyPrefixErrorMessage,
		};

		expect(getCreateApiKeyPrefixError(error)).toBe(apiKeyPrefixErrorMessage);
		expect(getCreateApiKeyErrorMessage(error)).toBe(apiKeyPrefixErrorMessage);
	});

	it("uses mutation messages for non-prefix errors", () => {
		const error = {
			message: "You are not a member of this organization",
		};

		expect(getCreateApiKeyPrefixError(error)).toBeUndefined();
		expect(getCreateApiKeyErrorMessage(error)).toBe(
			"You are not a member of this organization",
		);
	});

	it("falls back to a generic message when no server message exists", () => {
		expect(getCreateApiKeyPrefixError({})).toBeUndefined();
		expect(getCreateApiKeyErrorMessage({})).toBe("Failed to generate API key");
	});
});
