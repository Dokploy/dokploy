import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the DB one layer down so the REAL assertSSODomainsGloballyUnique runs
// against controlled provider rows. Mirrors the git-provider-idor.test.ts
// pattern: mocking the exported function would not intercept the internal
// db.query.ssoProvider.findMany call.
const mockDb = vi.hoisted(() => ({
	query: {
		ssoProvider: {
			findMany: vi.fn(),
		},
	},
}));
vi.mock("@dokploy/server/db", () => ({ db: mockDb }));

import { assertSSODomainsGloballyUnique } from "@dokploy/server/services/proprietary/sso";

beforeEach(() => {
	vi.clearAllMocks();
});

// Inputs passed to the guard mirror what the router forwards: `input.domains`
// arrives already lowercased/trimmed/deduped by the ssoProviderBodySchema
// transform, so the guard does not re-normalize the input side. The stored
// `domain` column is a lowercase CSV string (e.g. "acme.com,subsidiary.com").
const PROVIDER_A = { providerId: "p-org-a", domain: "acme.com,subsidiary.com" };
const PROVIDER_B = { providerId: "p-org-b", domain: "acme.com" };

describe("assertSSODomainsGloballyUnique", () => {
	describe("lookup scope", () => {
		it("queries ssoProvider globally without an organizationId filter", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([]);
			await assertSSODomainsGloballyUnique(["acme.com"], "p-mine");
			const arg = mockDb.query.ssoProvider.findMany.mock.calls?.[0]?.[0];
			expect(arg).toEqual({
				columns: { providerId: true, domain: true },
			});
			// Regression guard: the update guard previously filtered by
			// organizationId, which is the bug being fixed.
			expect(arg).not.toHaveProperty("where");
		});

		it("returns the same single findMany call (no per-org re-query)", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([]);
			await assertSSODomainsGloballyUnique(["acme.com"], "p-mine");
			expect(mockDb.query.ssoProvider.findMany).toHaveBeenCalledTimes(1);
		});
	});

	describe("update path (excludeProviderId set)", () => {
		it("rejects a domain claimed by a provider in a DIFFERENT organization", async () => {
			// Org A owns "acme.com,subsidiary.com"; Org B edits its own provider to
			// add "acme.com". The global lookup must catch this cross-org collision.
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_A]);
			await expect(
				assertSSODomainsGloballyUnique(["acme.com"], "p-org-b"),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("rejects a domain claimed by a provider in the SAME organization", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_B]);
			await expect(
				assertSSODomainsGloballyUnique(["acme.com"], "p-other-in-same-org"),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("still rejects a different provider's domain even when self is excluded", async () => {
			// Editing p-mine (excluded) but p-other in the same org owns acme.com.
			mockDb.query.ssoProvider.findMany.mockResolvedValue([
				{ providerId: "p-mine", domain: "acme.com" },
				{ providerId: "p-other", domain: "acme.com" },
			]);
			await expect(
				assertSSODomainsGloballyUnique(["acme.com"], "p-mine"),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("skips the provider being edited so keeping its own domains is allowed", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_B]);
			await expect(
				assertSSODomainsGloballyUnique(["acme.com"], "p-org-b"),
			).resolves.toBeUndefined();
		});

		it("matches against any domain in a provider's multi-domain CSV value", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_A]);
			await expect(
				assertSSODomainsGloballyUnique(["subsidiary.com"], "p-org-b"),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("allows a new domain when the edited provider keeps only unrelated domains", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([
				{ providerId: "p-mine", domain: "mine.com" },
				{ providerId: "p-other", domain: "other.com" },
			]);
			await expect(
				assertSSODomainsGloballyUnique(["fresh.com"], "p-mine"),
			).resolves.toBeUndefined();
		});
	});

	describe("register path (no excludeProviderId)", () => {
		it("rejects a domain already claimed by any provider globally", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_B]);
			await expect(
				assertSSODomainsGloballyUnique(["acme.com"]),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("rejects when any one of several new domains collides", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([
				{ providerId: "p1", domain: "claimed.com" },
			]);
			await expect(
				assertSSODomainsGloballyUnique(["fresh.com", "claimed.com"]),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
		});

		it("allows all-new domains", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([
				{ providerId: "p1", domain: "claimed.com" },
			]);
			await expect(
				assertSSODomainsGloballyUnique(["fresh.com", "new.com"]),
			).resolves.toBeUndefined();
		});
	});

	describe("empty table", () => {
		it("returns void when no providers exist", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([]);
			await expect(
				assertSSODomainsGloballyUnique(["acme.com"], "p-x"),
			).resolves.toBeUndefined();
		});
	});

	describe("error shape", () => {
		it("throws a TRPCError so tRPC maps the HTTP status", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_B]);
			const err = await assertSSODomainsGloballyUnique(
				["acme.com"],
				"p-mine",
			).catch((e) => e);
			expect(err).toBeInstanceOf(TRPCError);
		});

		it("names the colliding domain in the message", async () => {
			mockDb.query.ssoProvider.findMany.mockResolvedValue([PROVIDER_B]);
			const err = await assertSSODomainsGloballyUnique(
				["acme.com"],
				"p-mine",
			).catch((e) => e);
			expect(err.message).toContain("acme.com");
		});
	});
});
