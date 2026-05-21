import { describe, expect, it, vi } from "vitest";

const findFirst = vi.fn();

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			organizationRole: {
				findFirst,
			},
		},
	},
}));

const { assertAssignableOrganizationRole } = await import(
	"@dokploy/server/services/user"
);

describe("assertAssignableOrganizationRole", () => {
	it("allows built-in non-owner roles without querying custom roles", async () => {
		await expect(
			assertAssignableOrganizationRole("org-1", "member"),
		).resolves.toBeUndefined();
		await expect(
			assertAssignableOrganizationRole("org-1", "admin"),
		).resolves.toBeUndefined();

		expect(findFirst).not.toHaveBeenCalled();
	});

	it("rejects owner for direct credentials provisioning", async () => {
		await expect(
			assertAssignableOrganizationRole("org-1", "owner"),
		).rejects.toMatchObject({
			code: "FORBIDDEN",
			message: "Cannot create a user with the owner role",
		});
	});

	it("allows an existing custom organization role", async () => {
		findFirst.mockResolvedValueOnce({ id: "role-1", role: "support" });

		await expect(
			assertAssignableOrganizationRole("org-1", "support"),
		).resolves.toBeUndefined();
	});

	it("rejects unknown custom role names", async () => {
		findFirst.mockResolvedValueOnce(undefined);

		await expect(
			assertAssignableOrganizationRole("org-1", "missing-role"),
		).rejects.toMatchObject({
			code: "NOT_FOUND",
			message: 'Role "missing-role" not found',
		});
	});
});
