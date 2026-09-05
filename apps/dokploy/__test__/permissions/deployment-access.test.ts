import { TRPCError } from "@trpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `assertDeploymentAccess` delegates the service-id branch to
// `checkServicePermissionAndAccess` and the server branch to `findServerById`.
// Mock those one layer down so we can drive each branch of the guard and assert
// which path was taken, without touching the DB or a real server record.
const mockCheckServicePermissionAndAccess = vi.hoisted(() => vi.fn());
const mockFindServerById = vi.hoisted(() => vi.fn());

vi.mock("@dokploy/server/services/permission", () => ({
	checkServicePermissionAndAccess: mockCheckServicePermissionAndAccess,
}));

vi.mock("@dokploy/server/services/server", () => ({
	findServerById: mockFindServerById,
}));

import { assertDeploymentAccess } from "@dokploy/server/services/deployment";

const ctx = {
	user: { id: "user-1" },
	session: { activeOrganizationId: "org-1" },
};

beforeEach(() => {
	vi.clearAllMocks();
	mockCheckServicePermissionAndAccess.mockResolvedValue(undefined);
});

const rejectAsUnauthorized = async (p: Promise<unknown>) => {
	const err = await p.catch((e: unknown) => e);
	expect(err).toBeInstanceOf(TRPCError);
	expect(err).toMatchObject({ code: "UNAUTHORIZED" });
};

describe("assertDeploymentAccess (cross-tenant deployment/schedule guard)", () => {
	describe("service-id branch (application/compose deployments)", () => {
		it("delegates to checkServicePermissionAndAccess and resolves when allowed", async () => {
			await expect(
				assertDeploymentAccess(ctx, "app-1", null, "cancel"),
			).resolves.toBeUndefined();

			expect(mockCheckServicePermissionAndAccess).toHaveBeenCalledWith(
				ctx,
				"app-1",
				{ deployment: ["cancel"] },
			);
			expect(mockFindServerById).not.toHaveBeenCalled();
		});

		it("forwards the 'read' permission for log/list procedures", async () => {
			await expect(
				assertDeploymentAccess(ctx, "compose-1", null, "read"),
			).resolves.toBeUndefined();

			expect(mockCheckServicePermissionAndAccess).toHaveBeenCalledWith(
				ctx,
				"compose-1",
				{ deployment: ["read"] },
			);
		});

		it("propagates the authorization error from the service check", async () => {
			mockCheckServicePermissionAndAccess.mockRejectedValue(
				new TRPCError({ code: "FORBIDDEN", message: "nope" }),
			);

			await expect(
				assertDeploymentAccess(ctx, "app-1", null, "read"),
			).rejects.toMatchObject({ code: "FORBIDDEN" });
			expect(mockFindServerById).not.toHaveBeenCalled();
		});
	});

	describe("remote-server schedule branch (schedule.serverId set)", () => {
		it("resolves when the server belongs to the caller's organization", async () => {
			mockFindServerById.mockResolvedValue({
				serverId: "srv-1",
				organizationId: "org-1",
			});

			await expect(
				assertDeploymentAccess(
					ctx,
					null,
					{ serverId: "srv-1", organizationId: null },
					"cancel",
				),
			).resolves.toBeUndefined();

			expect(mockFindServerById).toHaveBeenCalledWith("srv-1");
			expect(mockCheckServicePermissionAndAccess).not.toHaveBeenCalled();
		});

		it("rejects when the server belongs to another organization (cross-tenant)", async () => {
			mockFindServerById.mockResolvedValue({
				serverId: "srv-1",
				organizationId: "org-2",
			});

			await rejectAsUnauthorized(
				assertDeploymentAccess(
					ctx,
					null,
					{ serverId: "srv-1", organizationId: null },
					"read",
				),
			);
			expect(mockCheckServicePermissionAndAccess).not.toHaveBeenCalled();
		});

		it("prefers the remote-server branch over the organizationId branch when both are present", async () => {
			mockFindServerById.mockResolvedValue({
				serverId: "srv-1",
				organizationId: "org-1",
			});

			await assertDeploymentAccess(
				ctx,
				null,
				{ serverId: "srv-1", organizationId: "org-2" },
				"read",
			);

			expect(mockFindServerById).toHaveBeenCalledWith("srv-1");
		});
	});

	describe("host-level schedule branch (dokploy-server: no serviceId, no serverId)", () => {
		it("resolves when schedule.organizationId matches the caller's organization", async () => {
			await expect(
				assertDeploymentAccess(
					ctx,
					null,
					{ serverId: null, organizationId: "org-1" },
					"cancel",
				),
			).resolves.toBeUndefined();

			expect(mockFindServerById).not.toHaveBeenCalled();
			expect(mockCheckServicePermissionAndAccess).not.toHaveBeenCalled();
		});

		it("rejects when schedule.organizationId belongs to another organization (the cross-tenant bug)", async () => {
			await rejectAsUnauthorized(
				assertDeploymentAccess(
					ctx,
					null,
					{ serverId: null, organizationId: "org-2" },
					"read",
				),
			);
			expect(mockFindServerById).not.toHaveBeenCalled();
			expect(mockCheckServicePermissionAndAccess).not.toHaveBeenCalled();
		});
	});

	describe("deny-by-default (no recognized owner)", () => {
		it("rejects when there is no serviceId and no schedule at all", async () => {
			await rejectAsUnauthorized(
				assertDeploymentAccess(ctx, null, null, "cancel"),
			);
			expect(mockFindServerById).not.toHaveBeenCalled();
			expect(mockCheckServicePermissionAndAccess).not.toHaveBeenCalled();
		});

		it("rejects when the schedule has neither serverId nor organizationId", async () => {
			await rejectAsUnauthorized(
				assertDeploymentAccess(
					ctx,
					null,
					{ serverId: null, organizationId: null },
					"read",
				),
			);
		});

		it("rejects when serviceId is empty string (falsy) and schedule is null", async () => {
			await rejectAsUnauthorized(
				assertDeploymentAccess(ctx, "", null, "cancel"),
			);
			// An empty/falsy serviceId must NOT be treated as a real service id.
			expect(mockCheckServicePermissionAndAccess).not.toHaveBeenCalled();
		});
	});

	describe("error shape and message", () => {
		it("uses the custom message when provided (allByType schedule branch)", async () => {
			await expect(
				assertDeploymentAccess(
					ctx,
					null,
					{ serverId: null, organizationId: "org-2" },
					"read",
					"You don't have access to this schedule.",
				),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
				message: "You don't have access to this schedule.",
			});
		});

		it("defaults to the deployment message for deployment procedures", async () => {
			await expect(
				assertDeploymentAccess(ctx, null, null, "cancel"),
			).rejects.toMatchObject({
				code: "UNAUTHORIZED",
				message: "You don't have access to this deployment.",
			});
		});
	});
});
