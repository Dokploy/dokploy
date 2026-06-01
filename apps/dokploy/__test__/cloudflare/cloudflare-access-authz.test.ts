import { describe, expect, it } from "vitest";
import { cloudflareAccessRouter } from "@/server/api/routers/cloudflare-access";
import { createCallerFactory } from "@/server/api/trpc";

/**
 * Cloudflare Access configuration changes org-wide auth on a published domain,
 * so every procedure is admin-gated. A `member` must never reach them.
 */
const createCaller = createCallerFactory(cloudflareAccessRouter);

const ctxFor = (role: "owner" | "admin" | "member") =>
	({
		user: { id: "user-1", email: "user@test.com", role },
		session: { activeOrganizationId: "org-1" },
		req: {} as unknown,
		res: {} as unknown,
	}) as never;

describe("cloudflareAccess router authorization", () => {
	const caller = createCaller(ctxFor("member"));

	it("member cannot read Access config", async () => {
		await expect(
			caller.byDomainId({ domainId: "dom-1" }),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("member cannot enable/update Access", async () => {
		await expect(
			caller.upsert({
				domainId: "dom-1",
				sessionDuration: "24h",
				allowEmails: ["a@example.com"],
				allowEmailDomains: [],
			}),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("member cannot remove Access", async () => {
		await expect(caller.remove({ domainId: "dom-1" })).rejects.toMatchObject({
			code: "UNAUTHORIZED",
		});
	});
});
