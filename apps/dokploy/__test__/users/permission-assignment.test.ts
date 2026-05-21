import { describe, expect, it } from "vitest";
import { assertPermissionsAssignableTarget } from "@/lib/permission-assignment";

describe("assertPermissionsAssignableTarget", () => {
	it("allows assigning permissions to another member", () => {
		expect(() =>
			assertPermissionsAssignableTarget(
				{ userId: "user-2", role: "member" },
				"user-1",
			),
		).not.toThrow();
	});

	it("allows assigning permissions to another custom-role member", () => {
		expect(() =>
			assertPermissionsAssignableTarget(
				{ userId: "user-2", role: "staging-deployer" },
				"user-1",
			),
		).not.toThrow();
	});

	it("rejects missing active-organization members", () => {
		expect(() =>
			assertPermissionsAssignableTarget(undefined, "user-1"),
		).toThrow("Target user is not a member of this organization");
	});

	it("rejects self-targeted permission updates", () => {
		expect(() =>
			assertPermissionsAssignableTarget(
				{ userId: "user-1", role: "member" },
				"user-1",
			),
		).toThrow("You cannot update your own permissions");
	});

	it("rejects static admin and owner targets", () => {
		expect(() =>
			assertPermissionsAssignableTarget(
				{ userId: "user-2", role: "owner" },
				"user-1",
			),
		).toThrow("Permissions can only be assigned");

		expect(() =>
			assertPermissionsAssignableTarget(
				{ userId: "user-3", role: "admin" },
				"user-1",
			),
		).toThrow("Permissions can only be assigned");
	});
});
