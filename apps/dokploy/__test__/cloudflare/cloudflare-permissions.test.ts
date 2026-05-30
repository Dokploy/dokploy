import { describe, expect, it } from "vitest";
import { cloudflareRouter } from "@/server/api/routers/cloudflare";
import { createCallerFactory } from "@/server/api/trpc";

/**
 * These tests assert the authorization model for the Cloudflare integration:
 * a `member` must never be able to read or mutate org-scoped Cloudflare
 * credentials, while owner/admin pass the gate.
 *
 * This guards against the subtle bug where `withPermission("cloudflare", …)`
 * would be used instead of `adminProcedure`: because `cloudflare` is an
 * enterprise-only resource, `checkPermission` short-circuits for static roles
 * and would silently authorize a `member`. The router uses `adminProcedure`
 * to enforce an owner/admin role directly — these tests fail if that ever
 * regresses to a permission-based gate.
 */
const createCaller = createCallerFactory(cloudflareRouter);

const ctxFor = (role: "owner" | "admin" | "member") =>
	({
		user: { id: "user-1", email: "user@test.com", role },
		session: { activeOrganizationId: "org-1" },
		req: {} as unknown,
		res: {} as unknown,
	}) as never;

const validCreate = {
	name: "production",
	apiToken: "cf-test-token",
	accountId: "acct-1",
};

describe("cloudflare router authorization", () => {
	describe("a member is denied every Cloudflare operation", () => {
		const caller = createCaller(ctxFor("member"));

		it("cannot create", async () => {
			await expect(caller.create(validCreate)).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		it("cannot update", async () => {
			await expect(
				caller.update({ cloudflareId: "x", name: "y", accountId: "z" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		});

		it("cannot remove", async () => {
			await expect(caller.remove({ cloudflareId: "x" })).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
		});

		it("cannot test a connection", async () => {
			await expect(
				caller.testConnection({ apiToken: "t", accountId: "a" }),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		});

		it("cannot list or read", async () => {
			await expect(caller.all()).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
			await expect(caller.one({ cloudflareId: "x" })).rejects.toMatchObject({
				code: "UNAUTHORIZED",
			});
		});
	});

	describe("owners and admins pass the admin gate", () => {
		it("owner can create", async () => {
			const caller = createCaller(ctxFor("owner"));
			await expect(caller.create(validCreate)).resolves.toBeDefined();
		});

		it("admin can create", async () => {
			const caller = createCaller(ctxFor("admin"));
			await expect(caller.create(validCreate)).resolves.toBeDefined();
		});
	});
});
