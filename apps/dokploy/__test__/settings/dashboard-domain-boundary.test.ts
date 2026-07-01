import { apiAssignDomain } from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

const validInput = {
	host: "dokploy.example.com",
	certificateType: "letsencrypt" as const,
	letsEncryptEmail: "admin@example.com",
	https: true,
};

describe("dashboard domain boundary", () => {
	it.each([
		"dokploy.example.com`) || Host(`evil.example.com",
		"dokploy.example.com,Host(`evil.example.com`)",
		" dokploy.example.com",
		"dokploy.example.com/path",
	])("rejects unsafe Traefik host syntax: %s", (host) => {
		expect(() =>
			apiAssignDomain.parse({
				...validInput,
				host,
			}),
		).toThrow();
	});

	it("accepts normal dashboard hostnames", () => {
		expect(apiAssignDomain.parse(validInput)).toMatchObject({
			host: "dokploy.example.com",
		});
	});
});
