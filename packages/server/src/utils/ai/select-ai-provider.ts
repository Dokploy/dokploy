import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ollama-ai-provider";

function getProviderName(apiUrl: string) {
	if (apiUrl.includes("api.openai.com")) return "openai";
	if (apiUrl.includes("azure.com")) return "azure";
	if (apiUrl.includes("api.anthropic.com")) return "anthropic";
	if (apiUrl.includes("api.cohere.ai")) return "cohere";
	if (apiUrl.includes("api.perplexity.ai")) return "perplexity";
	if (apiUrl.includes("api.mistral.ai")) return "mistral";
	if (apiUrl.includes("localhost:11434") || apiUrl.includes("ollama"))
		return "ollama";
	if (apiUrl.includes("api.deepinfra.com")) return "deepinfra";
	throw new Error(`Unsupported AI provider for URL: ${apiUrl}`);
}

export function selectAIProvider(config: { apiUrl: string; apiKey: string }) {
	const providerName = getProviderName(config.apiUrl);

	switch (providerName) {
		case "openai":
			return createOpenAI({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
			});
		case "azure":
			return createAzure({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
			});
		case "anthropic":
			return createAnthropic({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
			});
		case "cohere":
			return createCohere({
				baseURL: config.apiUrl,
				apiKey: config.apiKey,
			});
		case "perplexity":
			return createOpenAICompatible({
				name: "perplexity",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		case "mistral":
			return createMistral({
				baseURL: config.apiUrl,
				apiKey: config.apiKey,
			});
		case "ollama":
			return createOllama({
				// optional settings, e.g.
				baseURL: config.apiUrl,
			});
		case "deepinfra":
			return createDeepInfra({
				baseURL: config.apiUrl,
				apiKey: config.apiKey,
			});
		default:
			throw new Error(`Unsupported AI provider: ${providerName}`);
	}
}
