import { afterEach, describe, expect, it, vi } from "vitest";

describe("resolveOrgMembershipLimit", () => {
	const originalEnv = process.env;

	afterEach(() => {
		process.env = originalEnv;
		vi.resetModules();
	});

	async function importFresh() {
		const mod = await import(
			"@dokploy/server/lib/membership-limit"
		);
		return mod.resolveOrgMembershipLimit;
	}

	it("returns undefined when ORG_MEMBERSHIP_LIMIT is not set", async () => {
		process.env = { ...originalEnv };
		delete process.env.ORG_MEMBERSHIP_LIMIT;
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBeUndefined();
	});

	it("returns undefined for empty string", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBeUndefined();
	});

	it("returns the parsed number for a valid positive integer", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "500" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBe(500);
	});

	it("returns the parsed number for a large value (effectively unlimited)", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "10000" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBe(10000);
	});

	it("returns undefined for zero", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "0" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBeUndefined();
	});

	it("returns undefined for negative numbers", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "-5" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBeUndefined();
	});

	it("returns undefined for non-numeric strings", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "abc" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBeUndefined();
	});

	it("returns undefined for NaN-producing values like Infinity", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "Infinity" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBeUndefined();
	});

	it("handles decimal values by returning them as-is", async () => {
		process.env = { ...originalEnv, ORG_MEMBERSHIP_LIMIT: "150.5" };
		const resolveOrgMembershipLimit = await importFresh();
		expect(resolveOrgMembershipLimit()).toBe(150.5);
	});
});
