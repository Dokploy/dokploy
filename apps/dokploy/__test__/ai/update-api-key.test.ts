import {
	AI_SECRET_MASK,
	resolveAiUpdateApiKey,
} from "@dokploy/server/services/ai";
import { describe, expect, it } from "vitest";

const existing = { apiKey: "sk-stored", apiUrl: "https://api.openai.com/v1" };

describe("resolveAiUpdateApiKey", () => {
	it("keeps the stored key when the URL is unchanged", () => {
		expect(
			resolveAiUpdateApiKey(
				{ apiKey: AI_SECRET_MASK, apiUrl: "https://api.openai.com/v1/" },
				existing,
			),
		).toBe("sk-stored");
	});

	it("rejects a URL change that would reuse the stored key", () => {
		expect(() =>
			resolveAiUpdateApiKey(
				{ apiKey: AI_SECRET_MASK, apiUrl: "https://evil.example/v1" },
				existing,
			),
		).toThrow(/requires entering the API key again/);
		expect(() =>
			resolveAiUpdateApiKey({ apiUrl: "https://evil.example/v1" }, existing),
		).toThrow(/requires entering the API key again/);
	});

	it("allows a URL change with a new key", () => {
		expect(
			resolveAiUpdateApiKey(
				{ apiKey: "sk-new", apiUrl: "https://other.example/v1" },
				existing,
			),
		).toBe("sk-new");
	});

	it("allows a URL change when no key is stored", () => {
		expect(
			resolveAiUpdateApiKey(
				{ apiKey: AI_SECRET_MASK, apiUrl: "http://localhost:11434" },
				{ apiKey: "", apiUrl: "http://old:11434" },
			),
		).toBe("");
	});

	it("leaves the key untouched on updates without key or URL", () => {
		expect(resolveAiUpdateApiKey({}, existing)).toBeUndefined();
	});
});
