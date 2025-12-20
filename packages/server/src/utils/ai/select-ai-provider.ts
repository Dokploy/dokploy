import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ai-sdk-ollama";

/**
 * Normalize Azure OpenAI base URL by removing trailing /openai/v1 or /v1 paths
 * Azure OpenAI SDK handles path construction internally, so these need to be stripped
 * to avoid duplicate paths in the final URL (e.g., /v1/v1/chat/completions)
 */
export function normalizeAzureUrl(url: string): string {
	let normalized = url;
	// Remove trailing /openai/v1 if present
	normalized = normalized.replace(/\/openai\/v1\/?$/, "");
	// Remove trailing /v1 if present
	normalized = normalized.replace(/\/v1\/?$/, "");
	// Remove trailing slash
	normalized = normalized.replace(/\/$/, "");
	return normalized;
}

export function getProviderName(apiUrl: string) {
	if (apiUrl.includes("api.openai.com")) return "openai";
	if (apiUrl.includes("azure.com")) return "azure";
	if (apiUrl.includes("api.anthropic.com")) return "anthropic";
	if (apiUrl.includes("api.cohere.ai")) return "cohere";
	if (apiUrl.includes("api.perplexity.ai")) return "perplexity";
	if (apiUrl.includes("api.mistral.ai")) return "mistral";
	if (apiUrl.includes(":11434") || apiUrl.includes("ollama")) return "ollama";
	if (apiUrl.includes("api.deepinfra.com")) return "deepinfra";
	if (apiUrl.includes("generativelanguage.googleapis.com")) return "gemini";
	return "custom";
}

export function selectAIProvider(config: { apiUrl: string; apiKey: string }) {
	const providerName = getProviderName(config.apiUrl);

	switch (providerName) {
		case "openai":
			return createOpenAI({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
			});
		case "azure": {
			// Azure OpenAI endpoints should not include /openai/v1 or /v1 at the end
			// The SDK handles the path construction internally
			const azureBaseUrl = normalizeAzureUrl(config.apiUrl);

			return createAzure({
				apiKey: config.apiKey,
				baseURL: azureBaseUrl,
			});
		}
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
		case "gemini":
			return createOpenAICompatible({
				name: "gemini",
				baseURL: config.apiUrl,
				queryParams: { key: config.apiKey },
				headers: {},
			});
		case "custom":
			return createOpenAICompatible({
				name: "custom",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		default:
			throw new Error(`Unsupported AI provider: ${providerName}`);
	}
}

export const getProviderHeaders = (
	apiUrl: string,
	apiKey: string,
): Record<string, string> => {
	// Azure OpenAI
	if (apiUrl.includes("azure.com")) {
		return {
			"api-key": apiKey,
		};
	}

	// Anthropic
	if (apiUrl.includes("anthropic")) {
		return {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
		};
	}

	// Mistral
	if (apiUrl.includes("mistral")) {
		return {
			Authorization: apiKey,
		};
	}

	// Default (OpenAI style)
	return {
		Authorization: `Bearer ${apiKey}`,
	};
};
export interface Model {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}
