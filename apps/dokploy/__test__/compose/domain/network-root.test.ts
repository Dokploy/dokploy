import { addDokployNetworkToRoot } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("addDokployNetworkToRoot", () => {
	it("should create network object if networks is undefined", () => {
		const result = addDokployNetworkToRoot(undefined);
		expect(result).toEqual({ "dokploy-network": { external: true } });
	});

	it("should add network to an empty object", () => {
		const result = addDokployNetworkToRoot({});
		expect(result).toEqual({ "dokploy-network": { external: true } });
	});

	it("should not modify existing network configuration", () => {
		const existing = { "dokploy-network": { external: false } };
		const result = addDokployNetworkToRoot(existing);
		expect(result).toEqual({ "dokploy-network": { external: true } });
	});

	it("should add network alongside existing networks", () => {
		const existing = { "other-network": { external: true } };
		const result = addDokployNetworkToRoot(existing);
		expect(result).toEqual({
			"other-network": { external: true },
			"dokploy-network": { external: true },
		});
	});
});
