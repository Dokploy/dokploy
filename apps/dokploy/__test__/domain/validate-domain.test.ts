import { validateDomain, validateDomainForServer } from "@dokploy/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mutable holder so each test can control what the domain resolves to.
const dnsState = vi.hoisted(() => ({
	addresses: [] as string[],
	error: null as Error | null,
}));

vi.mock("node:dns", () => ({
	default: {
		resolve4: (
			_host: string,
			cb: (err: Error | null, addresses?: string[]) => void,
		) => cb(dnsState.error, dnsState.addresses),
	},
}));

beforeEach(() => {
	dnsState.addresses = [];
	dnsState.error = null;
});

describe("validateDomain (multiple server IPs)", () => {
	it("passes when the domain resolves to any one of the server's IPs", async () => {
		// The bug: a server reachable on an internal SSH IP and a separate public
		// IP. DNS points to the public IP, which must still validate.
		dnsState.addresses = ["203.0.113.10"];

		const result = await validateDomain("multi.example.com", [
			"10.0.0.2",
			"203.0.113.10",
		]);

		expect(result.isValid).toBe(true);
	});

	it("fails when the domain resolves to none of the server's IPs", async () => {
		dnsState.addresses = ["198.51.100.5"];

		const result = await validateDomain("wrong.example.com", [
			"10.0.0.2",
			"203.0.113.10",
		]);

		expect(result.isValid).toBe(false);
		expect(result.error).toContain("198.51.100.5");
	});

	it("is valid when no expected IPs are provided (resolve-only)", async () => {
		dnsState.addresses = ["203.0.113.10"];

		const result = await validateDomain("any.example.com");

		expect(result.isValid).toBe(true);
		expect(result.resolvedIp).toBe("203.0.113.10");
	});
});

describe("validateDomainForServer (validation modes)", () => {
	it("proxy mode validates against the user provided IP", async () => {
		dnsState.addresses = ["203.0.113.10"];

		const valid = await validateDomainForServer({
			domain: "proxied.example.com",
			validationMode: "proxy",
			expectedIp: "203.0.113.10",
		});
		expect(valid.isValid).toBe(true);

		dnsState.addresses = ["198.51.100.5"];
		const invalid = await validateDomainForServer({
			domain: "proxied.example.com",
			validationMode: "proxy",
			expectedIp: "203.0.113.10",
		});
		expect(invalid.isValid).toBe(false);
	});

	it("skip mode only confirms the domain resolves", async () => {
		dnsState.addresses = ["198.51.100.5"];

		const result = await validateDomainForServer({
			domain: "skipped.example.com",
			validationMode: "skip",
			// An IP that does not match anything; skip must ignore it.
			expectedIp: "203.0.113.10",
		});

		expect(result.isValid).toBe(true);
	});

	it("skip mode reports failure when the domain does not resolve", async () => {
		dnsState.error = new Error("ENOTFOUND");

		const result = await validateDomainForServer({
			domain: "missing.example.com",
			validationMode: "skip",
		});

		expect(result.isValid).toBe(false);
	});
});
