import { describe, expect, it } from "vitest";
import { assertInvitationCanBeEmailed } from "@/lib/invitation-email";

const future = new Date("2026-01-02T00:00:00.000Z");
const now = new Date("2026-01-01T00:00:00.000Z");

describe("assertInvitationCanBeEmailed", () => {
	it("allows active pending invitations in the active organization", () => {
		expect(() =>
			assertInvitationCanBeEmailed(
				{
					organizationId: "org-1",
					status: "pending",
					expiresAt: future,
				},
				"org-1",
				now,
			),
		).not.toThrow();
	});

	it("rejects missing invitations", () => {
		expect(() => assertInvitationCanBeEmailed(undefined, "org-1", now)).toThrow(
			"Invitation not found",
		);
	});

	it("rejects invitations from another organization", () => {
		expect(() =>
			assertInvitationCanBeEmailed(
				{
					organizationId: "org-2",
					status: "pending",
					expiresAt: future,
				},
				"org-1",
				now,
			),
		).toThrow("You are not allowed to send this invitation");
	});

	it("rejects non-pending invitations", () => {
		expect(() =>
			assertInvitationCanBeEmailed(
				{
					organizationId: "org-1",
					status: "canceled",
					expiresAt: future,
				},
				"org-1",
				now,
			),
		).toThrow("Only pending invitations can be sent");
	});

	it("rejects expired pending invitations", () => {
		expect(() =>
			assertInvitationCanBeEmailed(
				{
					organizationId: "org-1",
					status: "pending",
					expiresAt: now,
				},
				"org-1",
				now,
			),
		).toThrow("Cannot send an expired invitation");
	});
});
