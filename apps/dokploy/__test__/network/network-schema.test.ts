import {
	apiCreateNetwork,
	apiFindOneNetwork,
	apiRemoveNetwork,
} from "@dokploy/server/db/schema";
import { describe, expect, it } from "vitest";

describe("apiCreateNetwork", () => {
	it("accepts a minimal create payload (just name)", () => {
		const result = apiCreateNetwork.safeParse({ name: "my-net" });
		expect(result.success).toBe(true);
	});

	it("rejects an empty name", () => {
		const result = apiCreateNetwork.safeParse({ name: "" });
		expect(result.success).toBe(false);
	});

	it("accepts all supported drivers", () => {
		for (const driver of [
			"bridge",
			"host",
			"overlay",
			"macvlan",
			"none",
			"ipvlan",
		] as const) {
			const result = apiCreateNetwork.safeParse({ name: "net", driver });
			expect(result.success, `driver=${driver}`).toBe(true);
		}
	});

	it("rejects an unknown driver", () => {
		const result = apiCreateNetwork.safeParse({ name: "net", driver: "lan" });
		expect(result.success).toBe(false);
	});

	it("accepts an IPAM config with subnet + gateway", () => {
		const result = apiCreateNetwork.safeParse({
			name: "net",
			ipam: {
				driver: "default",
				config: [{ subnet: "172.28.0.0/16", gateway: "172.28.0.1" }],
			},
		});
		expect(result.success).toBe(true);
	});

	it("accepts an IPAM config with only ipRange", () => {
		const result = apiCreateNetwork.safeParse({
			name: "net",
			ipam: { config: [{ ipRange: "172.28.5.0/24" }] },
		});
		expect(result.success).toBe(true);
	});

	it("allows explicit serverId as optional", () => {
		const result = apiCreateNetwork.safeParse({
			name: "net",
			serverId: "srv_123",
		});
		expect(result.success).toBe(true);
	});

	it("allows serverId to be null", () => {
		const result = apiCreateNetwork.safeParse({
			name: "net",
			serverId: null,
		});
		expect(result.success).toBe(true);
	});

	it("accepts boolean flags (internal, attachable, enableIPv6)", () => {
		const result = apiCreateNetwork.safeParse({
			name: "net",
			internal: true,
			attachable: true,
			enableIPv6: true,
		});
		expect(result.success).toBe(true);
	});
});

describe("apiFindOneNetwork / apiRemoveNetwork", () => {
	it("requires a non-empty networkId on lookup", () => {
		expect(apiFindOneNetwork.safeParse({ networkId: "" }).success).toBe(false);
		expect(apiFindOneNetwork.safeParse({ networkId: "n_1" }).success).toBe(
			true,
		);
	});

	it("requires a non-empty networkId on remove", () => {
		expect(apiRemoveNetwork.safeParse({ networkId: "" }).success).toBe(false);
		expect(apiRemoveNetwork.safeParse({ networkId: "n_1" }).success).toBe(true);
	});
});
