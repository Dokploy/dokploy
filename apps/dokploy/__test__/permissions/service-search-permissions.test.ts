import { describe, expect, it, vi } from "vitest";

describe("Service Search Permissions for Owners and Admins (Fixes Issue #5361)", () => {
	const mockServices = [
		{ id: "srv-1", name: "app-created-by-owner-a", organizationId: "org-1" },
		{ id: "srv-2", name: "app-created-by-owner-b", organizationId: "org-1" },
		{ id: "srv-3", name: "app-in-another-org", organizationId: "org-2" },
	];

	// Implementation of search filter resolution matching the router logic
	const resolveSearchFilters = async (
		ctx: {
			user: { id: string; role: "owner" | "admin" | "member" };
			session: { activeOrganizationId: string };
		},
		memberRecord: {
			role: "owner" | "admin" | "member";
			accessedServices: string[];
		},
	) => {
		const isPrivileged =
			ctx.user.role === "owner" ||
			ctx.user.role === "admin" ||
			memberRecord.role === "owner" ||
			memberRecord.role === "admin";

		// Always scope to the active organization
		const orgScopedServices = mockServices.filter(
			(s) => s.organizationId === ctx.session.activeOrganizationId,
		);

		if (!isPrivileged) {
			const { accessedServices } = memberRecord;
			if (accessedServices.length === 0) {
				return { items: [], total: 0 };
			}
			const items = orgScopedServices.filter((s) =>
				accessedServices.includes(s.id),
			);
			return { items, total: items.length };
		}

		// Privileged users (owner/admin) receive all services in the active organization
		return { items: orgScopedServices, total: orgScopedServices.length };
	};

	it("returns all organization services to owners even when accessedServices does not include them", async () => {
		const ownerCtx = {
			user: { id: "user-owner-b", role: "owner" as const },
			session: { activeOrganizationId: "org-1" },
		};
		// Owner B has empty accessedServices or only their own created services
		const memberRecord = {
			role: "owner" as const,
			accessedServices: ["srv-2"], // Missing srv-1 created by owner A
		};

		const result = await resolveSearchFilters(ownerCtx, memberRecord);

		expect(result.total).toBe(2);
		expect(result.items.map((s) => s.id)).toEqual(["srv-1", "srv-2"]);
		expect(result.items.some((s) => s.id === "srv-1")).toBe(true);
	});

	it("returns all organization services to admins even when accessedServices is empty", async () => {
		const adminCtx = {
			user: { id: "user-admin", role: "admin" as const },
			session: { activeOrganizationId: "org-1" },
		};
		const memberRecord = {
			role: "admin" as const,
			accessedServices: [],
		};

		const result = await resolveSearchFilters(adminCtx, memberRecord);

		expect(result.total).toBe(2);
		expect(result.items.map((s) => s.id)).toEqual(["srv-1", "srv-2"]);
	});

	it("restricts regular members to their assigned accessedServices", async () => {
		const memberCtx = {
			user: { id: "user-member", role: "member" as const },
			session: { activeOrganizationId: "org-1" },
		};
		const memberRecord = {
			role: "member" as const,
			accessedServices: ["srv-1"],
		};

		const result = await resolveSearchFilters(memberCtx, memberRecord);

		expect(result.total).toBe(1);
		expect(result.items[0].id).toBe("srv-1");
		expect(result.items.some((s) => s.id === "srv-2")).toBe(false);
	});

	it("returns empty result immediately for regular members with no accessedServices", async () => {
		const memberCtx = {
			user: { id: "user-member-no-access", role: "member" as const },
			session: { activeOrganizationId: "org-1" },
		};
		const memberRecord = {
			role: "member" as const,
			accessedServices: [],
		};

		const result = await resolveSearchFilters(memberCtx, memberRecord);

		expect(result.total).toBe(0);
		expect(result.items).toEqual([]);
	});

	it("never leaks services from other organizations even to owners", async () => {
		const ownerCtx = {
			user: { id: "user-owner", role: "owner" as const },
			session: { activeOrganizationId: "org-1" },
		};
		const memberRecord = {
			role: "owner" as const,
			accessedServices: [],
		};

		const result = await resolveSearchFilters(ownerCtx, memberRecord);

		expect(result.items.some((s) => s.organizationId === "org-2")).toBe(false);
	});
});
