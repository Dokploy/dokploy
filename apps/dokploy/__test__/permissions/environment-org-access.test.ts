import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `assertEnvironmentOrgAccess` is a resource-scoped tenant guard used by
 * cross-resource move operations (e.g. `compose.move`) to ensure the target
 * environment cannot be relocated into a different organization than the
 * caller's active one. It loads the environment together with its `project`
 * relation (in a single query) and rejects when the project's
 * `organizationId` does not match.
 */
const environmentFindFirst = vi.hoisted(() => vi.fn());
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			environments: { findFirst: environmentFindFirst },
		},
	},
}));

import { assertEnvironmentOrgAccess } from "@dokploy/server/services/environment";

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-A" },
};

const buildEnvironment = (organizationId: string) => ({
	environmentId: "env-target",
	projectId: "proj-target",
	name: "target",
	description: null,
	createdAt: "2026-01-01T00:00:00.000Z",
	isDefault: false,
	env: "",
	project: {
		projectId: "proj-target",
		name: "target-project",
		description: null,
		createdAt: "2026-01-01T00:00:00.000Z",
		organizationId,
	},
});

beforeEach(() => {
	environmentFindFirst.mockReset();
});

describe("assertEnvironmentOrgAccess (environment cross-tenant IDOR guard)", () => {
	it("rejects an environment that belongs to another organization with UNAUTHORIZED", async () => {
		environmentFindFirst.mockResolvedValue(buildEnvironment("org-B"));
		await expect(
			assertEnvironmentOrgAccess(ctx, "env-target"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});

	it("throws a TRPCError so tRPC maps the HTTP status", async () => {
		environmentFindFirst.mockResolvedValue(buildEnvironment("org-B"));
		const err = await assertEnvironmentOrgAccess(ctx, "env-target").catch(
			(e) => e,
		);
		expect(err).toBeInstanceOf(TRPCError);
	});

	it("uses a message that identifies the cross-tenant rejection", async () => {
		environmentFindFirst.mockResolvedValue(buildEnvironment("org-B"));
		const err = await assertEnvironmentOrgAccess(ctx, "env-target").catch(
			(e) => e,
		);
		expect(err.message).toBe(
			"You are not authorized to access this environment",
		);
	});

	it("allows an environment that belongs to the caller's active organization", async () => {
		const environment = buildEnvironment("org-A");
		environmentFindFirst.mockResolvedValue(environment);
		await expect(
			assertEnvironmentOrgAccess(ctx, "env-target"),
		).resolves.toEqual(environment);
	});

	it("rethrows NOT_FOUND when the environment does not exist", async () => {
		environmentFindFirst.mockResolvedValue(undefined);
		await expect(
			assertEnvironmentOrgAccess(ctx, "missing-env"),
		).rejects.toMatchObject({ code: "NOT_FOUND" });
	});

	it("still rejects cross-tenant access for owner/admin", async () => {
		const ownerCtx = {
			user: { id: "owner-1" },
			session: { activeOrganizationId: "org-A" },
		};
		environmentFindFirst.mockResolvedValue(buildEnvironment("org-B"));
		await expect(
			assertEnvironmentOrgAccess(ownerCtx, "env-target"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
});
