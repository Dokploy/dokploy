import { assertZoneTunnelAccountMatch } from "@dokploy/server/services/cloudflare/orchestrator";
import { describe, expect, it } from "vitest";

describe("assertZoneTunnelAccountMatch", () => {
	it("passes when zone and tunnel share an account", () => {
		expect(() =>
			assertZoneTunnelAccountMatch({
				zoneName: "example.com",
				zoneAccountId: "acc-a",
				serverName: "prod-1",
				tunnelAccountId: "acc-a",
			}),
		).not.toThrow();
	});

	it("throws BAD_REQUEST when accounts differ", () => {
		expect(() =>
			assertZoneTunnelAccountMatch({
				zoneName: "example.com",
				zoneAccountId: "acc-a",
				serverName: "prod-1",
				tunnelAccountId: "acc-b",
			}),
		).toThrow(/Cannot route example\.com via prod-1/);
	});

	it("throws when tunnel account is null (server has no tunnel account bound)", () => {
		expect(() =>
			assertZoneTunnelAccountMatch({
				zoneName: "example.com",
				zoneAccountId: "acc-a",
				serverName: "prod-1",
				tunnelAccountId: null,
			}),
		).toThrow(/has no Cloudflare account bound/);
	});
});
