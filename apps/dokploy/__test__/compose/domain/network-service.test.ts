import { addDokployNetworkToService } from "@dokploy/server";
import { describe, expect, it } from "vitest";

describe("addDokployNetworkToService", () => {
	it("should add network to an empty array", () => {
		const result = addDokployNetworkToService([]);
		expect(result).toEqual(["dokploy-network", "default"]);
	});

	it("should not add duplicate network to an array", () => {
		const result = addDokployNetworkToService(["dokploy-network"]);
		expect(result).toEqual(["dokploy-network", "default"]);
	});

	it("should add network to an existing array with other networks", () => {
		const result = addDokployNetworkToService(["other-network"]);
		expect(result).toEqual(["other-network", "dokploy-network", "default"]);
	});

	it("should add network to an object if networks is an object", () => {
		const result = addDokployNetworkToService({ "other-network": {} });
		expect(result).toEqual({
			"other-network": {},
			"dokploy-network": {},
			default: {},
		});
	});

	it("should not duplicate default network when already present", () => {
		const result = addDokployNetworkToService(["default", "dokploy-network"]);
		expect(result).toEqual(["default", "dokploy-network"]);
	});

	describe("skipDefaultNetwork option", () => {
		it("should still add dokploy-network but skip default when true (array)", () => {
			const result = addDokployNetworkToService(["dokploy-network"], true);
			expect(result).toEqual(["dokploy-network"]);
		});

		it("should skip default on an empty array when true", () => {
			const result = addDokployNetworkToService([], true);
			expect(result).toEqual(["dokploy-network"]);
		});

		it("should preserve other existing networks while skipping default", () => {
			const result = addDokployNetworkToService(["other-network"], true);
			expect(result).toEqual(["other-network", "dokploy-network"]);
		});

		it("should still add dokploy-network but skip default when true (object)", () => {
			const result = addDokployNetworkToService({ "other-network": {} }, true);
			expect(result).toEqual({
				"other-network": {},
				"dokploy-network": {},
			});
		});

		it("should default to false and preserve existing behavior when omitted", () => {
			const result = addDokployNetworkToService(["dokploy-network"]);
			expect(result).toEqual(["dokploy-network", "default"]);
		});
	});
});
