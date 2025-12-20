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
	// Use a single regex to handle all variations in one pass
	// This matches: /openai/v1 or /v1 at the end, with optional trailing slash
	const normalized = url.replace(/\/(?:openai\/v1|v1)\/?$/, "");
	// Remove any remaining trailing slash
	return normalized.replace(/\/$/, "");
}

export function getProviderName(apiUrl: string) {
	try {
		const url = new URL(apiUrl);
		const hostname = url.hostname.toLowerCase();

		if (hostname === "api.openai.com") return "openai";
		// Azure OpenAI uses *.openai.azure.com subdomain
		if (
			hostname.endsWith(".openai.azure.com") ||
			hostname === "openai.azure.com"
		)
			return "azure";
		if (hostname === "api.anthropic.com") return "anthropic";
		if (hostname === "api.cohere.ai") return "cohere";
		if (hostname === "api.perplexity.ai") return "perplexity";
		if (hostname === "api.mistral.ai") return "mistral";
		if (url.port === "11434" || hostname.includes("ollama")) return "ollama";
		if (hostname === "api.deepinfra.com") return "deepinfra";
		if (hostname === "generativelanguage.googleapis.com") return "gemini";
		return "custom";
	} catch {
		// If URL parsing fails, treat as custom provider
		// This is safe because custom providers still require valid authentication
		return "custom";
	}
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
	try {
		const url = new URL(apiUrl);
		const hostname = url.hostname.toLowerCase();

		// Azure OpenAI uses *.openai.azure.com subdomain
		if (
			hostname.endsWith(".openai.azure.com") ||
			hostname === "openai.azure.com"
		) {
			return {
				"api-key": apiKey,
			};
		}

		// Anthropic
		if (hostname === "api.anthropic.com") {
			return {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			};
		}

		// Mistral
		if (hostname === "api.mistral.ai") {
			return {
				Authorization: apiKey,
			};
		}

		// Default (OpenAI style)
		return {
			Authorization: `Bearer ${apiKey}`,
		};
	} catch {
		// Fallback to OpenAI-style headers if URL parsing fails
		return {
			Authorization: `Bearer ${apiKey}`,
		};
	}
};
export interface Model {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}
