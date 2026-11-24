import {
	getProviderName,
	selectAIProvider,
} from "@dokploy/server/utils/ai/select-ai-provider";
import { describe, expect, it } from "vitest";

describe("getProviderName", () => {
	it("detects Gemini provider for native API endpoint", () => {
		expect(
			getProviderName("https://generativelanguage.googleapis.com/v1beta"),
		).toBe("gemini");
	});

	it("detects Gemini provider for OpenAI-compatible endpoint", () => {
		expect(
			getProviderName(
				"https://generativelanguage.googleapis.com/v1beta/openai",
			),
		).toBe("gemini");
	});
});

describe("selectAIProvider for Gemini", () => {
	it("normalizes model name when invoked with models/ prefix using native URL", () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta",
			apiKey: "test-api-key",
		});

		const model = provider("models/gemini-2.5-flash");
		expect(model.modelId).toBe("gemini-2.5-flash");
	});

	it("keeps clean model name intact using native URL", () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta",
			apiKey: "test-api-key",
		});

		const model = provider("gemini-2.5-flash");
		expect(model.modelId).toBe("gemini-2.5-flash");
	});

	it("normalizes model name using /openai URL", () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
			apiKey: "test-api-key",
		});

		const model = provider("models/gemini-1.5-pro");
		expect(model.modelId).toBe("gemini-1.5-pro");
	});

	it("normalizes model name when called via languageModel method", () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta",
			apiKey: "test-api-key",
		});

		const model = (provider as any).languageModel("models/gemini-2.0-flash");
		expect(model.modelId).toBe("gemini-2.0-flash");
	});

	it("normalizes model name when called via chatModel method", () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta",
			apiKey: "test-api-key",
		});

		const model = (provider as any).chatModel("models/gemini-2.5-pro");
		expect(model.modelId).toBe("gemini-2.5-pro");
	});
});
