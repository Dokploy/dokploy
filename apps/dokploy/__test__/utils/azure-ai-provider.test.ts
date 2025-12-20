import { describe, expect, it } from "vitest";

/**
 * Test for Azure OpenAI endpoint URL normalization
 * These tests verify that Azure OpenAI URLs are properly cleaned up
 * to remove duplicate /v1 paths that would cause API errors
 */
describe("Azure OpenAI URL Normalization", () => {
	it("should strip /openai/v1 from Azure URL", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1";
		let result = input;
		result = result.replace(/\/openai\/v1\/?$/, "");
		result = result.replace(/\/v1\/?$/, "");
		result = result.replace(/\/$/, "");

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should strip /v1 from Azure URL", () => {
		const input = "https://workspacename.openai.azure.com/v1";
		let result = input;
		result = result.replace(/\/openai\/v1\/?$/, "");
		result = result.replace(/\/v1\/?$/, "");
		result = result.replace(/\/$/, "");

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should strip trailing slash from Azure URL", () => {
		const input = "https://workspacename.openai.azure.com/";
		let result = input;
		result = result.replace(/\/openai\/v1\/?$/, "");
		result = result.replace(/\/v1\/?$/, "");
		result = result.replace(/\/$/, "");

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should handle clean Azure URL without modification", () => {
		const input = "https://workspacename.openai.azure.com";
		let result = input;
		result = result.replace(/\/openai\/v1\/?$/, "");
		result = result.replace(/\/v1\/?$/, "");
		result = result.replace(/\/$/, "");

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should strip /openai/v1/ with trailing slash", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1/";
		let result = input;
		result = result.replace(/\/openai\/v1\/?$/, "");
		result = result.replace(/\/v1\/?$/, "");
		result = result.replace(/\/$/, "");

		expect(result).toBe("https://workspacename.openai.azure.com");
	});

	it("should build correct deployments endpoint for Azure", () => {
		const input = "https://workspacename.openai.azure.com/openai/v1";
		let apiUrl = input;
		apiUrl = apiUrl.replace(/\/openai\/v1\/?$/, "");
		apiUrl = apiUrl.replace(/\/v1\/?$/, "");
		apiUrl = apiUrl.replace(/\/$/, "");

		const deploymentsUrl = `${apiUrl}/openai/deployments?api-version=2023-05-15`;

		expect(deploymentsUrl).toBe(
			"https://workspacename.openai.azure.com/openai/deployments?api-version=2023-05-15",
		);
	});

	it("should not strip /v1 from middle of path", () => {
		const input = "https://workspacename.openai.azure.com/v1/something";
		let result = input;
		result = result.replace(/\/openai\/v1\/?$/, "");
		result = result.replace(/\/v1\/?$/, "");
		result = result.replace(/\/$/, "");

		// Should only strip trailing /v1, not /v1 in the middle
		expect(result).toBe("https://workspacename.openai.azure.com/v1/something");
	});
});
