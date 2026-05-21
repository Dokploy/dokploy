import { describe, expect, it } from "vitest";
import { assertPermissionAssignmentTargetAllowed } from "@/lib/member-permissions";

const assertPermissionTarget = (
	actorUserId = "user-1",
	targetUserId = "user-2",
	targetRole = "member",
) =>
	assertPermissionAssignmentTargetAllowed({
		actorUserId,
		targetUserId,
		targetRole,
	});

describe("assertPermissionAssignmentTargetAllowed", () => {
	it("allows permission assignment to regular and custom-role members", () => {
		expect(() => assertPermissionTarget()).not.toThrow();
		expect(() =>
			assertPermissionTarget("owner-1", "user-2", "staging-deployer"),
		).not.toThrow();
	});

	it("rejects self permission assignment", () => {
		expect(() => assertPermissionTarget("user-1", "user-1")).toThrow(
			"You cannot assign permissions to yourself",
		);
	});

	it("rejects manual permission assignment to static privileged roles", () => {
		expect(() => assertPermissionTarget("owner-1", "user-2", "owner")).toThrow(
			"Owner and admin permissions cannot be assigned manually",
		);
		expect(() => assertPermissionTarget("owner-1", "user-2", "admin")).toThrow(
			"Owner and admin permissions cannot be assigned manually",
		);
	});
});
