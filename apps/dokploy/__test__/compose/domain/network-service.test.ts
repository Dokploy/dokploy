import { addDokployNetworkToService } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("addDokployNetworkToService", () => {
	it("should add network to an empty array", () => {
		const result = addDokployNetworkToService([]);
		expect(result).toEqual(["dokploy-network"]);
	});

	it("should not add duplicate network to an array", () => {
		const result = addDokployNetworkToService(["dokploy-network"]);
		expect(result).toEqual(["dokploy-network"]);
	});

	it("should add network to an existing array with other networks", () => {
		const result = addDokployNetworkToService(["other-network"]);
		expect(result).toEqual(["other-network", "dokploy-network"]);
	});

	it("should add network to an object if networks is an object", () => {
		const result = addDokployNetworkToService({ "other-network": {} });
		expect(result).toEqual({ "other-network": {}, "dokploy-network": {} });
	});
});
