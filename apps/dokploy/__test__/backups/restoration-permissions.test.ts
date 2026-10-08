import { db } from "@dokploy/server/db";
import { restorations } from "@dokploy/server/db/schema";
import type { inferRouterContext } from "@trpc/server";
import { inArray, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";

type TestContext = {
	user: { id: string; role: string };
	session: { activeOrganizationId: string };
};

vi.hoisted(() => {
	if (process.env.RESTORATION_TEST_DATABASE_URL)
		process.env.DATABASE_URL = process.env.RESTORATION_TEST_DATABASE_URL;
});

vi.unmock("@dokploy/server/db");
vi.mock("@dokploy/server", () => ({ IS_CLOUD: false }));
vi.mock("@/server/api/trpc", async () => {
	const { initTRPC } = await import("@trpc/server");
	const t = initTRPC.context<TestContext>().create();
	return { createTRPCRouter: t.router, protectedProcedure: t.procedure };
});
vi.mock("@dokploy/server/services/permission", () => ({
	checkPermission: () => Promise.resolve(),
	checkServicePermissionAndAccess: () => Promise.resolve(),
	hasPermission: (ctx: TestContext, permissions: Record<string, unknown>) =>
		Promise.resolve(
			ctx.user.id === "none"
				? false
				: ctx.user.id === "volume-only"
					? !!permissions.volumeBackup
					: true,
		),
	findMemberByUserId: (id: string) =>
		Promise.resolve({
			role: id.startsWith("owner") ? "owner" : "member",
			accessedServices:
				id === "limited" ? ["service-a"] : ["service-a", "service-b"],
		}),
}));

import {
	getAccessibleRestoration,
	restorationRouter,
} from "@/server/api/routers/restoration";

const context = (id: string, org = "org-a"): TestContext => ({
	user: { id, role: id.startsWith("owner") ? "owner" : "member" },
	session: { activeOrganizationId: org },
});
const caller = (id: string, org?: string) =>
	restorationRouter.createCaller(
		context(id, org) as unknown as inferRouterContext<typeof restorationRouter>,
	);

describe.skipIf(!process.env.RESTORATION_TEST_DATABASE_URL)(
	"Restoration permissions with PostgreSQL",
	() => {
		beforeAll(async () => {
			await db
				.delete(restorations)
				.where(
					inArray(restorations.restorationId, [
						"a-volume",
						"a-database",
						"b-volume",
						"platform",
					]),
				);
			await db.execute(
				sql`INSERT INTO organization (id) VALUES ('org-a'), ('org-b') ON CONFLICT DO NOTHING`,
			);
			await db.insert(restorations).values([
				{
					restorationId: "a-volume",
					organizationId: "org-a",
					kind: "volume",
					serviceId: "service-a",
					serviceType: "compose",
					serviceName: "Website",
					targetName: "uploads",
					backupFile: "uploads.tar",
					destinationName: "S3",
					status: "done",
					createdAt: "2026-10-08T10:00:00Z",
				},
				{
					restorationId: "a-database",
					organizationId: "org-a",
					kind: "database",
					serviceId: "service-b",
					serviceType: "postgres",
					serviceName: "Database",
					targetName: "app",
					backupFile: "db.sql.gz",
					destinationName: "S3",
					status: "error",
					createdAt: "2026-10-08T11:00:00Z",
				},
				{
					restorationId: "b-volume",
					organizationId: "org-b",
					kind: "volume",
					serviceId: "service-a",
					serviceType: "compose",
					serviceName: "Private",
					targetName: "private",
					backupFile: "private.tar",
					destinationName: "Private S3",
					status: "done",
					createdAt: "2026-10-08T12:00:00Z",
				},
				{
					restorationId: "platform",
					organizationId: null,
					kind: "dokploy",
					serviceId: "web-server",
					serviceType: "web-server",
					serviceName: "Dokploy",
					targetName: "Dokploy",
					backupFile: "server.zip",
					destinationName: "S3",
					status: "done",
					createdAt: "2026-10-08T13:00:00Z",
				},
			]);
		});

		it("keeps another organization's rows and logs inaccessible", async () => {
			const list = await caller("owner-a").list({});
			expect(list.rows.map((row) => row.restorationId)).toEqual([
				"platform",
				"a-database",
				"a-volume",
			]);
			await expect(
				getAccessibleRestoration(context("owner-a"), "b-volume"),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});
		it("limits members to their permitted services and hides platform restoration", async () => {
			const list = await caller("limited").list({});
			expect(list.rows.map((row) => row.restorationId)).toEqual(["a-volume"]);
			await expect(
				getAccessibleRestoration(context("limited"), "platform"),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
			await expect(
				getAccessibleRestoration(context("limited"), "a-database"),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});
		it("respects independent database and volume read permissions", async () => {
			expect(
				(await caller("volume-only").list({})).rows.map(
					(row) => row.restorationId,
				),
			).toEqual(["a-volume"]);
			expect((await caller("none").list({})).rows).toEqual([]);
		});
		it("filters and paginates without disclosing the other organization's count", async () => {
			const filtered = await caller("owner-a").list({
				search: "Database",
				kind: "database",
				status: "error",
			});
			expect(filtered.total).toBe(1);
			expect(filtered.rows[0]?.restorationId).toBe("a-database");
			const page = await caller("owner-a").list({ limit: 1, offset: 1 });
			expect(page.total).toBe(3);
			expect(page.rows[0]?.restorationId).toBe("a-database");
		});
	},
);
