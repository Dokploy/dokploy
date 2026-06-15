import { describe, expect, it, vi } from "vitest";

/**
 * Integration-style tests that verify the membership limit enforcement logic
 * as implemented by better-auth's organization plugin.
 *
 * These tests replicate the exact condition from:
 *   better-auth/dist/plugins/organization/routes/crud-invites.mjs
 *   better-auth/dist/plugins/organization/routes/crud-members.mjs
 *
 * The condition is:
 *   const membershipLimit = ctx.context.orgOptions?.membershipLimit || 100;
 *   if (membersCount >= membershipLimit) throw ORGANIZATION_MEMBERSHIP_LIMIT_REACHED;
 */

function simulateAcceptInvitation(opts: {
	membershipLimit: number | undefined;
	currentMemberCount: number;
}): { allowed: boolean; effectiveLimit: number } {
	const effectiveLimit = opts.membershipLimit || 100;
	const allowed = opts.currentMemberCount < effectiveLimit;
	return { allowed, effectiveLimit };
}

describe("accept-invitation membership limit enforcement", () => {
	describe("with default limit (no ORG_MEMBERSHIP_LIMIT env)", () => {
		it("allows acceptance when org has fewer than 100 members", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: undefined,
				currentMemberCount: 50,
			});
			expect(result.allowed).toBe(true);
			expect(result.effectiveLimit).toBe(100);
		});

		it("blocks acceptance when org has exactly 100 members", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: undefined,
				currentMemberCount: 100,
			});
			expect(result.allowed).toBe(false);
			expect(result.effectiveLimit).toBe(100);
		});

		it("blocks acceptance when org has more than 100 members", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: undefined,
				currentMemberCount: 150,
			});
			expect(result.allowed).toBe(false);
		});

		it("allows acceptance when org has exactly 99 members", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: undefined,
				currentMemberCount: 99,
			});
			expect(result.allowed).toBe(true);
		});
	});

	describe("with custom limit via ORG_MEMBERSHIP_LIMIT", () => {
		it("allows acceptance when limit is 500 and org has 100 members", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: 500,
				currentMemberCount: 100,
			});
			expect(result.allowed).toBe(true);
			expect(result.effectiveLimit).toBe(500);
		});

		it("blocks acceptance when limit is 500 and org has 500 members", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: 500,
				currentMemberCount: 500,
			});
			expect(result.allowed).toBe(false);
		});

		it("allows acceptance with very high limit (10000) regardless of count", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: 10000,
				currentMemberCount: 9999,
			});
			expect(result.allowed).toBe(true);
			expect(result.effectiveLimit).toBe(10000);
		});

		it("blocks acceptance when limit is 10000 and count reaches it", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: 10000,
				currentMemberCount: 10000,
			});
			expect(result.allowed).toBe(false);
		});
	});

	describe("interaction between resolveOrgMembershipLimit and better-auth", () => {
		it("resolveOrgMembershipLimit returns undefined → better-auth uses 100", async () => {
			const originalEnv = process.env.ORG_MEMBERSHIP_LIMIT;
			delete process.env.ORG_MEMBERSHIP_LIMIT;

			const { resolveOrgMembershipLimit } = await import(
				"@dokploy/server/lib/membership-limit"
			);
			const limit = resolveOrgMembershipLimit();
			const result = simulateAcceptInvitation({
				membershipLimit: limit,
				currentMemberCount: 100,
			});

			expect(limit).toBeUndefined();
			expect(result.allowed).toBe(false);
			expect(result.effectiveLimit).toBe(100);

			if (originalEnv !== undefined) {
				process.env.ORG_MEMBERSHIP_LIMIT = originalEnv;
			}
		});

		it("resolveOrgMembershipLimit returns 500 → better-auth uses 500", async () => {
			const originalEnv = process.env.ORG_MEMBERSHIP_LIMIT;
			process.env.ORG_MEMBERSHIP_LIMIT = "500";

			vi.resetModules();
			const { resolveOrgMembershipLimit } = await import(
				"@dokploy/server/lib/membership-limit"
			);
			const limit = resolveOrgMembershipLimit();
			const result = simulateAcceptInvitation({
				membershipLimit: limit,
				currentMemberCount: 100,
			});

			expect(limit).toBe(500);
			expect(result.allowed).toBe(true);
			expect(result.effectiveLimit).toBe(500);

			if (originalEnv !== undefined) {
				process.env.ORG_MEMBERSHIP_LIMIT = originalEnv;
			} else {
				delete process.env.ORG_MEMBERSHIP_LIMIT;
			}
		});
	});

	describe("add-member endpoint uses same limit logic", () => {
		it("adding a member is blocked at default limit of 100", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: undefined,
				currentMemberCount: 100,
			});
			expect(result.allowed).toBe(false);
		});

		it("adding a member is allowed with custom limit above current count", () => {
			const result = simulateAcceptInvitation({
				membershipLimit: 200,
				currentMemberCount: 100,
			});
			expect(result.allowed).toBe(true);
		});
	});
});
