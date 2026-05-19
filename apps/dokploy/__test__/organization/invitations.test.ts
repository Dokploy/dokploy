import { describe, expect, it } from "vitest";
import { canRemoveInvitation } from "@/lib/invitations";

const now = new Date("2026-05-20T12:00:00.000Z");

describe("canRemoveInvitation", () => {
	it("allows expired pending invitations to be removed", () => {
		expect(
			canRemoveInvitation(
				{
					status: "pending",
					expiresAt: new Date("2026-05-20T11:59:59.000Z"),
				},
				now,
			),
		).toBe(true);
	});

	it("allows canceled invitations to be removed before expiry", () => {
		expect(
			canRemoveInvitation(
				{
					status: "canceled",
					expiresAt: new Date("2026-05-20T12:30:00.000Z"),
				},
				now,
			),
		).toBe(true);
	});

	it("keeps active pending invitations on the cancel flow", () => {
		expect(
			canRemoveInvitation(
				{
					status: "pending",
					expiresAt: new Date("2026-05-20T12:30:00.000Z"),
				},
				now,
			),
		).toBe(false);
	});
});
