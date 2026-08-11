import {
	DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
	normalizeBlockedCidrs,
	validateBlockedCidrs,
	validateExternalUpstreamTargetUrl,
} from "@dokploy/server/utils/network/external-upstream";
import { describe, expect, test } from "vitest";

describe("external upstream target validation", () => {
	test("normalizes blocked CIDR input", () => {
		expect(
			normalizeBlockedCidrs([
				"",
				" 127.0.0.0/8 ",
				"127.0.0.0/8",
				"  ",
				"10.0.0.0/8",
			]),
		).toEqual(["127.0.0.0/8", "10.0.0.0/8"]);
	});

	test("rejects invalid blocked CIDR values", () => {
		expect(() => validateBlockedCidrs(["nope"])).toThrow(
			"Invalid blocked address or CIDR: nope",
		);
	});

	test("rejects non-http protocols", async () => {
		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl: "tcp://1.1.1.1:8080",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).rejects.toThrow("Target URL must use http:// or https://");
	});

	test("rejects credentials in target URLs", async () => {
		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl: "https://user:pass@example.com",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).rejects.toThrow("Target URL must not include credentials");
	});

	test("rejects localhost hostnames", async () => {
		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl: "http://localhost:3000",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).rejects.toThrow("Target URL points to a blocked network range");
	});

	test("rejects blocked private IPs", async () => {
		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl: "http://127.0.0.1:3000",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).rejects.toThrow("Target URL points to a blocked network range");
	});

	test("accepts a public HTTP target", async () => {
		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl: "https://1.1.1.1:8443",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).resolves.toBe("https://1.1.1.1:8443/");
	});
});
