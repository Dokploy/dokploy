import { pickTunnelAccount } from "@dokploy/server/services/cloudflare/account-picker";
import { describe, expect, it } from "vitest";

const acc = (id: string, name = id) => ({ id, name });

describe("pickTunnelAccount", () => {
	it("returns the only account when config has one", () => {
		const r = pickTunnelAccount({
			accounts: [acc("a")],
			zoneAccountIds: [],
			explicitAccountId: null,
		});
		expect(r).toEqual({ kind: "ok", accountId: "a" });
	});

	it("returns the explicit account when set, regardless of zones", () => {
		const r = pickTunnelAccount({
			accounts: [acc("a"), acc("b")],
			zoneAccountIds: ["a", "b"],
			explicitAccountId: "b",
		});
		expect(r).toEqual({ kind: "ok", accountId: "b" });
	});

	it("rejects an explicit account that isn't in config.accounts", () => {
		const r = pickTunnelAccount({
			accounts: [acc("a")],
			zoneAccountIds: [],
			explicitAccountId: "z",
		});
		expect(r.kind).toBe("error");
	});

	it("auto-derives when multi-account but all zones share one account", () => {
		const r = pickTunnelAccount({
			accounts: [acc("a"), acc("b")],
			zoneAccountIds: ["a", "a"],
			explicitAccountId: null,
		});
		expect(r).toEqual({ kind: "ok", accountId: "a" });
	});

	it("is ambiguous when multi-account and zones span accounts", () => {
		const r = pickTunnelAccount({
			accounts: [acc("a"), acc("b")],
			zoneAccountIds: ["a", "b"],
			explicitAccountId: null,
		});
		expect(r).toEqual({ kind: "ambiguous" });
	});

	it("is ambiguous when multi-account and zero zones (no signal)", () => {
		const r = pickTunnelAccount({
			accounts: [acc("a"), acc("b")],
			zoneAccountIds: [],
			explicitAccountId: null,
		});
		expect(r).toEqual({ kind: "ambiguous" });
	});

	it("errors when accounts is empty", () => {
		const r = pickTunnelAccount({
			accounts: [],
			zoneAccountIds: [],
			explicitAccountId: null,
		});
		expect(r.kind).toBe("error");
	});
});
