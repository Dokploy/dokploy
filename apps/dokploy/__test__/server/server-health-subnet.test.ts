import { getSubnetCapacity } from "@dokploy/server/services/server-health";
import { describe, expect, test } from "vitest";

describe("getSubnetCapacity", () => {
	test("returns null for missing/invalid input", () => {
		expect(getSubnetCapacity(undefined)).toBeNull();
		expect(getSubnetCapacity("")).toBeNull();
		expect(getSubnetCapacity("10.0.0.0")).toBeNull();
		expect(getSubnetCapacity("not-a-subnet")).toBeNull();
		expect(getSubnetCapacity("10.0.0.0/33")).toBeNull();
		expect(getSubnetCapacity("10.0.0.0/-1")).toBeNull();
	});

	test("excludes network and broadcast addresses", () => {
		expect(getSubnetCapacity("10.0.1.0/24")).toBe(254);
		expect(getSubnetCapacity("10.0.0.0/16")).toBe(65534);
		expect(getSubnetCapacity("10.99.99.0/30")).toBe(2);
	});

	test("returns 0 for subnets too small to hold a host", () => {
		expect(getSubnetCapacity("10.0.0.0/31")).toBe(0);
		expect(getSubnetCapacity("10.0.0.0/32")).toBe(0);
	});
});
