import { VALID_HOSTNAME_REGEX } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("VALID_HOSTNAME_REGEX", () => {
	it.each([
		"example.com",
		"sub.example.com",
		"bbn-client.example.com",
		"a.b.c.example.co",
		"xn--80ak6aa92e.com",
		"123.example.com",
	])("accepts valid hostname %s", (host) => {
		expect(VALID_HOSTNAME_REGEX.test(host)).toBe(true);
	});

	it.each([
		"bbn_client.example.com",
		"-example.com",
		"example-.com",
		"example",
		"exa mple.com",
		"example..com",
		"",
		`a${"a".repeat(63)}.com`,
	])("rejects invalid hostname %s", (host) => {
		expect(VALID_HOSTNAME_REGEX.test(host)).toBe(false);
	});

	// IDNs (Cyrillic, German umlauts, etc.) must be submitted in their
	// ACME/punycode form ("xn--...") — that's what Let's Encrypt issues
	// certificates for, so raw Unicode labels are rejected here.
	it.each(["пример.рф", "bücher.de", "日本語.jp"])(
		"rejects raw unicode IDN %s",
		(host) => {
			expect(VALID_HOSTNAME_REGEX.test(host)).toBe(false);
		},
	);

	it.each([
		"xn--e1afmkfd.xn--p1ai", // punycode for пример.рф
		"xn--bcher-kva.de", // punycode for bücher.de
		"xn--wgv71a119e.jp", // punycode for 日本語.jp
	])("accepts punycode-encoded IDN %s", (host) => {
		expect(VALID_HOSTNAME_REGEX.test(host)).toBe(true);
	});
});
