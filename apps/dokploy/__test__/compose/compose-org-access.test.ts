import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `assertComposeOrgAccess` is a resource-scoped tenant guard that fetches a
 * compose (via `findComposeById`) and rejects when the compose's project
 * `organizationId` does not match the caller's active organization. It exists to
 * backstop the cross-tenant IDOR left open by `checkServicePermissionAndAccess`
 * (which is session-scoped and skips the `accessedServices` membership check
 * for owner/admin). These tests mock only the DB layer so the REAL helper and
 * the REAL `findComposeById` run against controlled data.
 */
const composeFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			compose: { findFirst: composeFindFirst },
		},
	},
}));

import { assertComposeOrgAccess } from "@dokploy/server/services/compose";

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-A" },
};

const buildCompose = (organizationId: string) => ({
	composeId: "compose-victim",
	name: "victim-service",
	environment: {
		environmentId: "env-1",
		projectId: "proj-1",
		name: "production",
		description: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		isDefault: true,
		env: "",
		project: {
			projectId: "proj-1",
			name: "victim-project",
			description: null,
			createdAt: "2026-01-01T00:00:00.000Z",
			organizationId,
		},
	},
});

beforeEach(() => {
	composeFindFirst.mockReset();
});

describe("assertComposeOrgAccess (compose cross-tenant IDOR guard)", () => {
	it("rejects a compose that belongs to another organization with UNAUTHORIZED", async () => {
		composeFindFirst.mockResolvedValue(buildCompose("org-B"));
		await expect(
			assertComposeOrgAccess(ctx, "compose-victim"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("throws a TRPCError so tRPC maps the HTTP status", async () => {
		composeFindFirst.mockResolvedValue(buildCompose("org-B"));
		const err = await assertComposeOrgAccess(ctx, "compose-victim").catch(
			(e) => e,
		);
		expect(err).toBeInstanceOf(TRPCError);
	});

	it("uses a message that identifies the cross-tenant rejection", async () => {
		composeFindFirst.mockResolvedValue(buildCompose("org-B"));
		const err = await assertComposeOrgAccess(ctx, "compose-victim").catch(
			(e) => e,
		);
		expect(err.message).toBe("You are not authorized to access this compose");
	});

	it("allows a compose that belongs to the caller's active organization", async () => {
		const compose = buildCompose("org-A");
		composeFindFirst.mockResolvedValue(compose);
		await expect(
			assertComposeOrgAccess(ctx, "compose-victim"),
		).resolves.toEqual(compose);
	});

	it("returns the fetched compose row so router procedures can reuse it", async () => {
		const compose = buildCompose("org-A");
		composeFindFirst.mockResolvedValue(compose);
		const result = await assertComposeOrgAccess(ctx, "compose-victim");
		expect(result).toBe(compose);
	});

	it("rethrows NOT_FOUND when the compose does not exist (via findComposeById)", async () => {
		composeFindFirst.mockResolvedValue(undefined);
		await expect(
			assertComposeOrgAccess(ctx, "missing-compose"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("still rejects cross-tenant access for owner/admin (checks resource, not role)", async () => {
		// An owner in org-A must still be rejected when the compose lives in org-B.
		// This is the core regression from 8127dc4: the session-scoped role check
		// does not detect a cross-organization composeId.
		const ownerCtx = {
			user: { id: "owner-1" },
			session: { activeOrganizationId: "org-A" },
		};
		composeFindFirst.mockResolvedValue(buildCompose("org-B"));
		await expect(
			assertComposeOrgAccess(ownerCtx, "compose-victim"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
