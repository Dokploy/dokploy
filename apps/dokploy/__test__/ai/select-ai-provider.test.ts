import {
	getProviderName,
	selectAIProvider,
} from "@dokploy/server/utils/ai/select-ai-provider";
import { generateText } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

describe("selectAIProvider Gemini request generation", () => {
	const mockFetch = vi.fn();

	beforeEach(() => {
		mockFetch.mockReset();
		vi.stubGlobal("fetch", mockFetch);
		mockFetch.mockResolvedValue(
			new Response(
				JSON.stringify({
					id: "chatcmpl-test",
					object: "chat.completion",
					created: Date.now(),
					model: "gemini-2.5-flash",
					choices: [
						{
							index: 0,
							message: {
								role: "assistant",
								content: "ok",
							},
							finish_reason: "stop",
						},
					],
					usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
				}),
				{
					status: 200,
					headers: { "Content-Type": "application/json" },
				},
			),
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("rewrites native Gemini URL to /openai and includes bearer token and normalized model in generation request", async () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta",
			apiKey: "secret-gemini-key",
		});

		const model = provider("models/gemini-2.5-flash");
		const result = await generateText({
			model,
			prompt: "Reply with ok",
		});

		expect(result.text).toBe("ok");
		expect(mockFetch).toHaveBeenCalledTimes(1);

		const [requestedUrl, options] = mockFetch.mock.calls[0];
		expect(String(requestedUrl)).toBe(
			"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
		);

		const headers = new Headers(options.headers);
		expect(headers.get("Authorization")).toBe("Bearer secret-gemini-key");

		const body = JSON.parse(options.body);
		expect(body.model).toBe("gemini-2.5-flash");
	});

	it("handles native Gemini URL with trailing slashes", async () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta///",
			apiKey: "secret-gemini-key",
		});

		const model = provider("gemini-2.5-flash");
		await generateText({
			model,
			prompt: "hello",
		});

		const [requestedUrl] = mockFetch.mock.calls[0];
		expect(String(requestedUrl)).toBe(
			"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
		);
	});

	it("preserves already-compatible OpenAI endpoint without duplicate /openai", async () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
			apiKey: "secret-gemini-key",
		});

		const model = provider("models/gemini-2.5-pro");
		await generateText({
			model,
			prompt: "hello",
		});

		const [requestedUrl] = mockFetch.mock.calls[0];
		expect(String(requestedUrl)).toBe(
			"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
		);
	});

	it("handles already-compatible OpenAI endpoint with trailing slashes", async () => {
		const provider = selectAIProvider({
			apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
			apiKey: "secret-gemini-key",
		});

		const model = provider("gemini-2.5-pro");
		await generateText({
			model,
			prompt: "hello",
		});

		const [requestedUrl] = mockFetch.mock.calls[0];
		expect(String(requestedUrl)).toBe(
			"https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
		);
	});
});
