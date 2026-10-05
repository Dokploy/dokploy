import {
	getProviderHeaders,
	toHeadersRecord,
} from "@dokploy/server/utils/ai/select-ai-provider";
import { describe, expect, it } from "vitest";

describe("toHeadersRecord", () => {
	it("canonicalises authorization so it replaces the built-in header", () => {
		expect(
			toHeadersRecord([{ key: "authorization", value: "Token abc" }]),
		).toEqual({ Authorization: "Token abc" });
	});

	it("keeps a single entry when the same name is given twice", () => {
		const record = toHeadersRecord([
			{ key: "Authorization", value: "Bearer first" },
			{ key: "AUTHORIZATION", value: "Token second" },
		]);
		expect(record).toEqual({ Authorization: "Token second" });
	});

	it("trims names and drops blank ones", () => {
		expect(
			toHeadersRecord([
				{ key: "   ", value: "ignored" },
				{ key: " x-opencode-session ", value: "sess" },
			]),
		).toEqual({ "x-opencode-session": "sess" });
	});
});

describe("getProviderHeaders", () => {
	it("lets a custom authorization replace the Bearer default", () => {
		const headers = getProviderHeaders(
			"https://gateway.example.com/v1",
			"api-key",
			[{ key: "authorization", value: "Token abc" }],
		);
		expect(headers).toEqual({ Authorization: "Token abc" });
	});

	it("keeps the default authorization when only unrelated headers are set", () => {
		const headers = getProviderHeaders(
			"https://gateway.example.com/v1",
			"api-key",
			[{ key: "x-opencode-session", value: "sess" }],
		);
		expect(headers).toEqual({
			Authorization: "Bearer api-key",
			"x-opencode-session": "sess",
		});
	});

	it("does not send a duplicate authorization for the anthropic default", () => {
		const headers = getProviderHeaders(
			"https://api.anthropic.com/v1",
			"api-key",
			[{ key: "x-api-key", value: "Token abc" }],
		);
		expect(headers).toEqual({
			"x-api-key": "Token abc",
			"anthropic-version": "2023-06-01",
		});
	});
});
