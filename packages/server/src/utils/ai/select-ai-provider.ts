import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOllama } from "ai-sdk-ollama";

export interface AIHeader {
	key: string;
	value: string;
}

// User-defined headers win over the built-in defaults, so a gateway can also
// override Authorization when it does not use the Bearer scheme.
export const toHeadersRecord = (
	headers?: AIHeader[] | null,
): Record<string, string> => {
	const record: Record<string, string> = {};
	for (const header of headers ?? []) {
		const key = header?.key?.trim();
		if (!key) continue;
		record[key] = header.value ?? "";
	}
	return record;
};

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
	if (apiUrl.includes("openrouter.ai")) return "openrouter";
	if (apiUrl.includes("api.z.ai")) return "zai";
	if (apiUrl.includes("api.minimax.io")) return "minimax";
	return "custom";
}

export function selectAIProvider(config: {
	apiUrl: string;
	apiKey: string;
	headers?: AIHeader[] | null;
}) {
	const providerName = getProviderName(config.apiUrl);
	const customHeaders = toHeadersRecord(config.headers);

	switch (providerName) {
		case "openai":
			return createOpenAI({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
				headers: customHeaders,
			});
		case "azure":
			// Azure OpenAI-compatible endpoints already include /v1 in the path.
			// Using createAzure with such URLs causes a doubled /v1//v1/ suffix.
			if (config.apiUrl.includes("/v1")) {
				return createOpenAICompatible({
					name: "azure",
					baseURL: config.apiUrl,
					headers: {
						"api-key": config.apiKey,
						Authorization: `Bearer ${config.apiKey}`,
						...customHeaders,
					},
				});
			}
			return createAzure({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
				headers: customHeaders,
			});
		case "anthropic":
			return createAnthropic({
				apiKey: config.apiKey,
				baseURL: config.apiUrl,
				headers: customHeaders,
			});
		case "cohere":
			return createCohere({
				baseURL: config.apiUrl,
				apiKey: config.apiKey,
				headers: customHeaders,
			});
		case "perplexity":
			return createOpenAICompatible({
				name: "perplexity",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					"X-Pplx-Integration": "dokploy",
					...customHeaders,
				},
			});
		case "mistral":
			return createMistral({
				baseURL: config.apiUrl,
				apiKey: config.apiKey,
				headers: customHeaders,
			});
		case "ollama":
			return createOllama({
				baseURL: config.apiUrl,
				headers: config.apiKey
					? { Authorization: `Bearer ${config.apiKey}`, ...customHeaders }
					: customHeaders,
			});
		case "deepinfra":
			return createDeepInfra({
				baseURL: config.apiUrl,
				apiKey: config.apiKey,
				headers: customHeaders,
			});
		case "gemini":
			return createOpenAICompatible({
				name: "gemini",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					...customHeaders,
				},
			});
		case "openrouter":
			return createOpenAICompatible({
				name: "openrouter",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					...customHeaders,
				},
			});
		case "zai":
			return createOpenAICompatible({
				name: "zai",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					...customHeaders,
				},
			});
		case "minimax":
			return createOpenAICompatible({
				name: "minimax",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					...customHeaders,
				},
			});
		case "custom":
			return createOpenAICompatible({
				name: "custom",
				baseURL: config.apiUrl,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
					...customHeaders,
				},
			});
		default:
			throw new Error(`Unsupported AI provider: ${providerName}`);
	}
}

export const getProviderHeaders = (
	apiUrl: string,
	apiKey: string,
	headers?: AIHeader[] | null,
): Record<string, string> => {
	const customHeaders = toHeadersRecord(headers);

	// Anthropic
	if (apiUrl.includes("anthropic")) {
		return {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			...customHeaders,
		};
	}

	// Mistral
	if (apiUrl.includes("mistral")) {
		return {
			Authorization: `Bearer ${apiKey}`,
			...customHeaders,
		};
	}

	// Default (OpenAI style)
	return {
		Authorization: `Bearer ${apiKey}`,
		...customHeaders,
	};
};

export interface Model {
	id: string;
	object: string;
	created: number;
	owned_by: string;
}
