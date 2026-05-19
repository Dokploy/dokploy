import { describe, expect, it } from "vitest";
import { isInactiveInvitation } from "@/components/dashboard/settings/users/invitation-status";

const now = new Date("2026-05-19T12:00:00.000Z");

describe("isInactiveInvitation", () => {
	it("treats canceled invitations as inactive before expiry", () => {
		expect(
			isInactiveInvitation(
				{
					status: "canceled",
					expiresAt: "2026-05-20T12:00:00.000Z",
				},
				now,
			),
		).toBe(true);
	});

	it("treats expired pending invitations as inactive", () => {
		expect(
			isInactiveInvitation(
				{
					status: "pending",
					expiresAt: "2026-05-18T12:00:00.000Z",
				},
				now,
			),
		).toBe(true);
	});

	it("keeps active pending invitations out of bulk cleanup", () => {
		expect(
			isInactiveInvitation(
				{
					status: "pending",
					expiresAt: "2026-05-20T12:00:00.000Z",
				},
				now,
			),
		).toBe(false);
	});
});
