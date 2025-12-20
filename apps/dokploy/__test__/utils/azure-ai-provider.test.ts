import { normalizeAzureUrl } from "@dokploy/server/utils/ai/select-ai-provider";
import { describe, expect, it } from "vitest";

/**
 * Test for Azure OpenAI endpoint URL normalization
 * These tests verify that Azure OpenAI URLs are properly cleaned up
 * to remove duplicate /v1 paths that would cause API errors
 */
describe("Azure OpenAI URL Normalization", () => {
	it("should strip /openai/v1 from Azure URL", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1";
		const result = normalizeAzureUrl(input);

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should strip /v1 from Azure URL", () => {
		const input = "https://workspacename.openai.azure.com/v1";
		const result = normalizeAzureUrl(input);

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should strip trailing slash from Azure URL", () => {
		const input = "https://workspacename.openai.azure.com/";
		const result = normalizeAzureUrl(input);

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should handle clean Azure URL without modification", () => {
		const input = "https://workspacename.openai.azure.com";
		const result = normalizeAzureUrl(input);

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should strip /openai/v1/ with trailing slash", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1/";
		const result = normalizeAzureUrl(input);

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should build correct deployments endpoint for Azure", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1";
		const apiUrl = normalizeAzureUrl(input);

		const deploymentsUrl = `${apiUrl}/openai/deployments?api-version=2023-05-15`;

		expect(deploymentsUrl).toBe(
			"https://workspacename.openai.azure.com/openai/deployments?api-version=2023-05-15",
		);
	});

	it("should not strip /v1 from middle of path", () => {
		const input = "https://workspacename.openai.azure.com/v1/something";
		const result = normalizeAzureUrl(input);

		// Should only strip trailing /v1, not /v1 in the middle
		expect(result).toBe("https://workspacename.openai.azure.com/v1/something");
	});

	it("should handle edge case with multiple trailing /v1", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1/v1";
		const result = normalizeAzureUrl(input);

		// Should only strip the last /v1
		expect(result).toBe("https://workspacename.openai.azure.com/openai/v1");
	});
});
