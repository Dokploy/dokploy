import { addDokployNetworkToService } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("addDokployNetworkToService", () => {
	it("should add dokploy-network and default when service had no networks key", () => {
		const result = addDokployNetworkToService(undefined);
		expect(result).toEqual(["dokploy-network", "default"]);
	});

	it("should only add dokploy-network to an explicit empty array (no default)", () => {
		const result = addDokployNetworkToService([]);
		expect(result).toEqual(["dokploy-network"]);
	});

	it("should not add duplicate dokploy-network and not force default", () => {
		const result = addDokployNetworkToService(["dokploy-network"]);
		expect(result).toEqual(["dokploy-network"]);
	});

	it("should add dokploy-network to an existing array with other networks (no default)", () => {
		const result = addDokployNetworkToService(["other-network"]);
		expect(result).toEqual(["other-network", "dokploy-network"]);
	});

	it("should add dokploy-network to an object if networks is an object (no default)", () => {
		const result = addDokployNetworkToService({ "other-network": {} });
		expect(result).toEqual({
			"other-network": {},
			"dokploy-network": {},
		});
	});

	it("should not duplicate default network when already present", () => {
		const result = addDokployNetworkToService(["default", "dokploy-network"]);
		expect(result).toEqual(["default", "dokploy-network"]);
	});
});
