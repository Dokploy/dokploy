import {
	DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
	normalizeBlockedCidrs,
	resolveExternalUpstreamTarget,
	validateBlockedCidrs,
	validateExternalUpstreamTargetUrl,
} from "@dokploy/server/utils/network/external-upstream";
import { beforeEach, describe, expect, test, vi } from "vitest";

const lookupMock = vi.hoisted(() => vi.fn());

vi.mock("node:dns/promises", () => ({
	lookup: lookupMock,
}));

beforeEach(() => {
	lookupMock.mockReset();
});

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

	test.each([
		"http://10.0.0.1",
		"http://172.16.0.1",
		"http://192.168.0.1",
		"http://[fd00::1]",
	])("rejects private network target %s by default", async (targetUrl) => {
		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl,
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

	test("rejects hostnames when DNS resolution fails", async () => {
		lookupMock.mockRejectedValue(new Error("DNS unavailable"));

		await expect(
			validateExternalUpstreamTargetUrl({
				targetUrl: "https://upstream.example",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).rejects.toThrow("Target URL hostname could not be resolved");
	});

	test("returns pinned IP URLs and original host metadata for DNS targets", async () => {
		lookupMock.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "2001:4860:4860::8888", family: 6 },
		]);

		await expect(
			resolveExternalUpstreamTarget({
				targetUrl: "https://upstream.example:8443/base?x=1",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).resolves.toEqual({
			urls: [
				"https://93.184.216.34:8443/base?x=1",
				"https://[2001:4860:4860::8888]:8443/base?x=1",
			],
			hostHeader: "upstream.example:8443",
			serverName: "upstream.example",
		});
	});

	test("rejects all DNS results when any answer is blocked", async () => {
		lookupMock.mockResolvedValue([
			{ address: "93.184.216.34", family: 4 },
			{ address: "10.0.0.10", family: 4 },
		]);

		await expect(
			resolveExternalUpstreamTarget({
				targetUrl: "https://upstream.example",
				blockedCidrs: DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS,
			}),
		).rejects.toThrow("Target URL points to a blocked network range");
	});
});
