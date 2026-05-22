import { TRPCError } from "@trpc/server";
import { describe, expect, it } from "vitest";
import { assertCanTransferOwnership } from "@/lib/organization-ownership";

const baseInput = {
	activeOrganizationId: "org-1",
	organizationOwnerId: "owner-user",
	currentUserId: "owner-user",
	currentOwnerMemberId: "owner-member",
	targetUserId: "target-user",
	targetOrganizationId: "org-1",
};

describe("assertCanTransferOwnership", () => {
	it("allows the organization owner to transfer to another member", () => {
		expect(() => assertCanTransferOwnership(baseInput)).not.toThrow();
	});

	it("requires an active organization", () => {
		expect(() =>
			assertCanTransferOwnership({
				...baseInput,
				activeOrganizationId: null,
			}),
		).toThrow(TRPCError);
	});

	it("rejects non-owner users", () => {
		expect(() =>
			assertCanTransferOwnership({
				...baseInput,
				currentUserId: "admin-user",
			}),
		).toThrow("Only the organization owner can transfer ownership");
	});

	it("rejects members from other organizations", () => {
		expect(() =>
			assertCanTransferOwnership({
				...baseInput,
				targetOrganizationId: "org-2",
			}),
		).toThrow("You are not allowed to transfer ownership to this member");
	});

	it("rejects self transfers", () => {
		expect(() =>
			assertCanTransferOwnership({
				...baseInput,
				targetUserId: "owner-user",
			}),
		).toThrow("You cannot transfer ownership to yourself");
	});
});
