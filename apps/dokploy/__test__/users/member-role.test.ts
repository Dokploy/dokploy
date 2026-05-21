import { describe, expect, it } from "vitest";
import { assertMemberRoleUpdateAllowed } from "@/lib/member-role";

const assertRoleChange = (
	actorRole: string,
	targetRole: string,
	nextRole: string,
	actorUserId = "user-1",
	targetUserId = "user-2",
) =>
	assertMemberRoleUpdateAllowed({
		actorRole,
		actorUserId,
		targetUserId,
		targetRole,
		nextRole,
	});

describe("assertMemberRoleUpdateAllowed", () => {
	it("allows owners to promote and demote admins", () => {
		expect(() => assertRoleChange("owner", "member", "admin")).not.toThrow();
		expect(() => assertRoleChange("owner", "admin", "member")).not.toThrow();
	});

	it("allows non-owners to update non-privileged roles", () => {
		expect(() =>
			assertRoleChange("admin", "member", "staging-deployer"),
		).not.toThrow();
		expect(() =>
			assertRoleChange("support-manager", "member", "staging-deployer"),
		).not.toThrow();
	});

	it("rejects self role changes", () => {
		expect(() =>
			assertRoleChange("owner", "member", "admin", "user-1", "user-1"),
		).toThrow("You cannot change your own role");
	});

	it("rejects owner role transfer attempts", () => {
		expect(() => assertRoleChange("owner", "owner", "admin")).toThrow(
			"The owner role is nontransferable",
		);
		expect(() => assertRoleChange("owner", "admin", "owner")).toThrow(
			"The owner role is nontransferable",
		);
	});

	it("rejects admin role updates from non-owners", () => {
		expect(() => assertRoleChange("admin", "member", "admin")).toThrow(
			"Only the organization owner can change admin roles",
		);
		expect(() => assertRoleChange("admin", "admin", "member")).toThrow(
			"Only the organization owner can change admin roles",
		);
		expect(() =>
			assertRoleChange("support-manager", "member", "admin"),
		).toThrow("Only the organization owner can change admin roles");
		expect(() =>
			assertRoleChange("support-manager", "admin", "member"),
		).toThrow("Only the organization owner can change admin roles");
	});
});
