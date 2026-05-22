import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { assertCanRemoveMemberTarget } from "@/lib/member-removal";

const removal = (
	overrides: {
		actorRole?: string;
		actorUserId?: string;
		targetRole?: string;
		targetUserId?: string;
	} = {},
) => ({
	actorRole: overrides.actorRole ?? "owner",
	actorUserId: overrides.actorUserId ?? "actor",
	targetRole: overrides.targetRole ?? "member",
	targetUserId: overrides.targetUserId ?? "target",
});

describe("assertCanRemoveMemberTarget", () => {
	it("allows a custom role with member.delete to remove regular members", () => {
		expect(() =>
			assertCanRemoveMemberTarget(
				removal({ actorRole: "support-manager", targetRole: "member" }),
			),
		).not.toThrow();
	});

	it("allows a custom role with member.delete to remove custom-role members", () => {
		expect(() =>
			assertCanRemoveMemberTarget(
				removal({
					actorRole: "support-manager",
					targetRole: "readonly-auditor",
				}),
			),
		).not.toThrow();
	});

	it("rejects self removal", () => {
		expect(() =>
			assertCanRemoveMemberTarget(
				removal({ actorUserId: "same-user", targetUserId: "same-user" }),
			),
		).toThrow(TRPCError);
	});

	it("rejects deleting the organization owner", () => {
		expect(() =>
			assertCanRemoveMemberTarget(removal({ targetRole: "owner" })),
		).toThrow("You cannot delete the organization owner");
	});

	it("allows owners to remove admins", () => {
		expect(() =>
			assertCanRemoveMemberTarget(
				removal({ actorRole: "owner", targetRole: "admin" }),
			),
		).not.toThrow();
	});

	it("rejects admins deleting other admins", () => {
		expect(() =>
			assertCanRemoveMemberTarget(
				removal({ actorRole: "admin", targetRole: "admin" }),
			),
		).toThrow("Only the organization owner can delete admins");
	});

	it("rejects custom roles deleting static admins", () => {
		expect(() =>
			assertCanRemoveMemberTarget(
				removal({ actorRole: "support-manager", targetRole: "admin" }),
			),
		).toThrow("Only the organization owner can delete admins");
	});
});
