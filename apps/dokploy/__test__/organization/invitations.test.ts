import { describe, expect, it } from "vitest";
import { isInvitationRemovable } from "@/lib/invitations";

describe("isInvitationRemovable", () => {
	const now = new Date("2026-05-20T12:00:00.000Z");

	it("blocks active pending invitations", () => {
		expect(
			isInvitationRemovable("pending", "2026-05-20T12:01:00.000Z", now),
		).toBe(false);
	});

	it("allows expired pending invitations", () => {
		expect(
			isInvitationRemovable("pending", "2026-05-20T11:59:00.000Z", now),
		).toBe(true);
	});

	it("allows canceled invitations before expiry", () => {
		expect(
			isInvitationRemovable("canceled", "2026-05-20T12:01:00.000Z", now),
		).toBe(true);
	});

	it("allows accepted invitations before expiry", () => {
		expect(
			isInvitationRemovable("accepted", "2026-05-20T12:01:00.000Z", now),
		).toBe(true);
	});
});
