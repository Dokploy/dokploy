import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createCohere } from "@ai-sdk/cohere";
import { createDeepInfra } from "@ai-sdk/deepinfra";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
	assertCloudHostResolvesPublic,
	fetchWithPublicEgress,
	type HostnameLookup,
	isBlockedCloudHost,
	normalizeHostname,
} from "@dokploy/server/utils/url/network";
import { createOllama } from "ai-sdk-ollama";

type NormalizeAIProviderUrlOptions = {
	allowPrivateNetwork?: boolean;
};

type AssertAIProviderUrlOptions = NormalizeAIProviderUrlOptions & {
	lookup?: HostnameLookup;
};

const hostnameMatches = (hostname: string, expectedHostname: string) =>
	hostname === expectedHostname || hostname.endsWith(`.${expectedHostname}`);

const parseProviderUrl = (apiUrl: string) => {
	try {
		return new URL(apiUrl);
	} catch {
		return null;
	}
};

export function normalizeAIProviderApiUrl(
	apiUrl: string,
	options: NormalizeAIProviderUrlOptions = {},
) {
	const allowPrivateNetwork =
		options.allowPrivateNetwork ?? process.env.IS_CLOUD !== "true";
	const url = parseProviderUrl(apiUrl);
	if (!url) {
		throw new Error("AI provider URL must be a valid URL");
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error("AI provider URL must use http or https");
	}

	if (!allowPrivateNetwork && url.protocol !== "https:") {
		throw new Error("AI provider URL must use https in cloud deployments");
	}

	if (url.username || url.password) {
		throw new Error("AI provider URL must not include credentials");
	}

	if (url.search || url.hash) {
		throw new Error("AI provider URL must not include query or fragment data");
	}

	if (!allowPrivateNetwork && isBlockedCloudHost(url.hostname)) {
		throw new Error("AI provider URL host is not allowed in cloud deployments");
	}

	const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
	return `${url.protocol}//${url.host}${pathname}`;
}

export async function assertAIProviderApiUrlAllowed(
	apiUrl: string,
	options: AssertAIProviderUrlOptions = {},
) {
	const allowPrivateNetwork =
		options.allowPrivateNetwork ?? process.env.IS_CLOUD !== "true";
	const normalizedApiUrl = normalizeAIProviderApiUrl(apiUrl, {
		allowPrivateNetwork,
	});

	if (!allowPrivateNetwork) {
		await assertCloudHostResolvesPublic(new URL(normalizedApiUrl).hostname, {
			fieldName: "AI provider URL host",
			lookup: options.lookup,
		});
	}

	return normalizedApiUrl;
}

export function getProviderName(apiUrl: string) {
	const url = parseProviderUrl(apiUrl);
	const hostname = normalizeHostname(url?.hostname ?? apiUrl);
	if (hostnameMatches(hostname, "api.openai.com")) return "openai";
	if (hostnameMatches(hostname, "azure.com")) return "azure";
	if (hostnameMatches(hostname, "api.anthropic.com")) return "anthropic";
	if (hostnameMatches(hostname, "api.cohere.ai")) return "cohere";
	if (hostnameMatches(hostname, "api.perplexity.ai")) return "perplexity";
	if (hostnameMatches(hostname, "api.mistral.ai")) return "mistral";
	if (
		url?.port === "11434" ||
		hostname === "ollama" ||
		hostname.endsWith(".ollama")
	) {
		return "ollama";
	}
	if (hostnameMatches(hostname, "api.deepinfra.com")) return "deepinfra";
	if (hostnameMatches(hostname, "generativelanguage.googleapis.com")) {
		return "gemini";
	}
	if (hostnameMatches(hostname, "openrouter.ai")) return "openrouter";
	if (hostnameMatches(hostname, "api.z.ai")) return "zai";
	if (hostnameMatches(hostname, "api.minimax.io")) return "minimax";
	return "custom";
}

const aiProviderFetch = (input: RequestInfo | URL, init?: RequestInit) => {
	return fetchWithPublicEgress(input, init, {
		fieldName: "AI provider URL",
	});
};

export function selectAIProvider(config: { apiUrl: string; apiKey: string }) {
	const apiUrl = normalizeAIProviderApiUrl(config.apiUrl);
	const providerName = getProviderName(apiUrl);

	switch (providerName) {
		case "openai":
			return createOpenAI({
				apiKey: config.apiKey,
				baseURL: apiUrl,
				fetch: aiProviderFetch,
			});
		case "azure":
			// Azure OpenAI-compatible endpoints already include /v1 in the path.
			// Using createAzure with such URLs causes a doubled /v1//v1/ suffix.
			if (apiUrl.includes("/v1")) {
				return createOpenAICompatible({
					name: "azure",
					baseURL: apiUrl,
					fetch: aiProviderFetch,
					headers: {
						"api-key": config.apiKey,
						Authorization: `Bearer ${config.apiKey}`,
					},
				});
			}
			return createAzure({
				apiKey: config.apiKey,
				baseURL: apiUrl,
				fetch: aiProviderFetch,
			});
		case "anthropic":
			return createAnthropic({
				apiKey: config.apiKey,
				baseURL: apiUrl,
				fetch: aiProviderFetch,
			});
		case "cohere":
			return createCohere({
				baseURL: apiUrl,
				apiKey: config.apiKey,
				fetch: aiProviderFetch,
			});
		case "perplexity":
			return createOpenAICompatible({
				name: "perplexity",
				baseURL: apiUrl,
				fetch: aiProviderFetch,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		case "mistral":
			return createMistral({
				baseURL: apiUrl,
				apiKey: config.apiKey,
				fetch: aiProviderFetch,
			});
		case "ollama":
			return createOllama({
				// optional settings, e.g.
				baseURL: apiUrl,
				fetch: aiProviderFetch,
			});
		case "deepinfra":
			return createDeepInfra({
				baseURL: apiUrl,
				apiKey: config.apiKey,
				fetch: aiProviderFetch,
			});
		case "gemini":
			return createOpenAICompatible({
				name: "gemini",
				baseURL: apiUrl,
				fetch: aiProviderFetch,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		case "openrouter":
			return createOpenAICompatible({
				name: "openrouter",
				baseURL: apiUrl,
				fetch: aiProviderFetch,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		case "zai":
			return createOpenAICompatible({
				name: "zai",
				baseURL: apiUrl,
				fetch: aiProviderFetch,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		case "minimax":
			return createOpenAICompatible({
				name: "minimax",
				baseURL: apiUrl,
				fetch: aiProviderFetch,
				headers: {
					Authorization: `Bearer ${config.apiKey}`,
				},
			});
		case "custom":
			return createOpenAICompatible({
				name: "custom",
				baseURL: apiUrl,
				fetch: aiProviderFetch,
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
	switch (getProviderName(apiUrl)) {
		case "anthropic":
			return {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			};
		case "mistral":
			return {
				Authorization: `Bearer ${apiKey}`,
			};
		default:
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
