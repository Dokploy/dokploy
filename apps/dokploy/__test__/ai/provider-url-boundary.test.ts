import {
	assertAIProviderApiUrlAllowed,
	getProviderName,
	normalizeAIProviderApiUrl,
} from "@dokploy/server/utils/ai/select-ai-provider";
import { describe, expect, it } from "vitest";

describe("AI provider URL boundary", () => {
	it("rejects private and credentialed provider URLs for cloud calls", () => {
		const unsafeUrls = [
			"http://127.0.0.1:11434",
			"https://127.0.0.1:11434",
			"https://169.254.169.254/latest",
			"https://[::1]:11434",
			"https://[fe90::1]:11434",
			"https://user:pass@api.openai.com/v1",
			"https://api.openai.com/v1?debug=true",
			"https://ollama",
		];

		for (const apiUrl of unsafeUrls) {
			expect(() =>
				normalizeAIProviderApiUrl(apiUrl, {
					allowPrivateNetwork: false,
				}),
			).toThrow(/AI provider URL/i);
		}
	});

	it("normalizes safe public provider URLs for cloud calls", () => {
		expect(
			normalizeAIProviderApiUrl("https://api.openai.com/v1/", {
				allowPrivateNetwork: false,
			}),
		).toBe("https://api.openai.com/v1");
	});

	it("rejects public-looking provider hostnames that resolve to private addresses", async () => {
		await expect(
			assertAIProviderApiUrlAllowed("https://api.openai.com/v1", {
				allowPrivateNetwork: false,
				lookup: async () => [{ address: "10.0.0.5", family: 4 }],
			}),
		).rejects.toThrow(/AI provider URL/i);
	});

	it("allows provider hostnames that resolve only to public addresses", async () => {
		await expect(
			assertAIProviderApiUrlAllowed("https://api.openai.com/v1/", {
				allowPrivateNetwork: false,
				lookup: async () => [{ address: "8.8.8.8", family: 4 }],
			}),
		).resolves.toBe("https://api.openai.com/v1");
	});

	it("does not resolve self-hosted provider hostnames when private networks are allowed", async () => {
		await expect(
			assertAIProviderApiUrlAllowed("http://127.0.0.1:11434/", {
				allowPrivateNetwork: true,
				lookup: async () => {
					throw new Error("lookup should not run");
				},
			}),
		).resolves.toBe("http://127.0.0.1:11434");
	});

	it("preserves local self-hosted providers when private network calls are allowed", () => {
		expect(
			normalizeAIProviderApiUrl("http://127.0.0.1:11434/", {
				allowPrivateNetwork: true,
			}),
		).toBe("http://127.0.0.1:11434");
	});

	it("does not classify attacker-controlled hostnames as official providers", () => {
		expect(getProviderName("https://api.openai.com.evil.example/v1")).toBe(
			"custom",
		);
		expect(getProviderName("https://api.anthropic.com.evil.example")).toBe(
			"custom",
		);
	});
});
