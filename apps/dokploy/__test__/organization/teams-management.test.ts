import { viewerRole } from "@dokploy/server/lib/access-control";
import {
	filterExpiredInvitations,
	isUniqueConstraintError,
	isViewerRole,
	normalizeInviteEmails,
	resolveMemberServers,
	STATIC_ROLES,
	sanitizeTeamName,
	validateInvitationCutoff,
	validateOwnershipTransfer,
	validateRoleTransition,
	validateTeamCapacity,
} from "@dokploy/server/services/organization-teams";
import { describe, expect, it } from "vitest";

describe("static roles include view-only viewer (issue #1413)", () => {
	it("registers viewer as a static role", () => {
		expect(STATIC_ROLES).toContain("viewer");
		expect(isViewerRole("viewer")).toBe(true);
		expect(isViewerRole("member")).toBe(false);
	});

	it("viewer can read services but cannot create them", () => {
		expect(viewerRole.authorize({ service: ["read"] }).success).toBe(true);
		expect(viewerRole.authorize({ service: ["create"] }).success).toBe(false);
	});

	it("viewer cannot manage organization resources or servers", () => {
		expect(viewerRole.authorize({ server: ["read"] }).success).toBe(false);
		expect(viewerRole.authorize({ project: ["create"] }).success).toBe(false);
		expect(viewerRole.authorize({ member: ["create"] }).success).toBe(false);
	});

	it("viewer keeps read access to assigned scopes", () => {
		expect(viewerRole.authorize({ deployment: ["read"] }).success).toBe(true);
		expect(viewerRole.authorize({ deployment: ["create"] }).success).toBe(
			false,
		);
		expect(viewerRole.authorize({ domain: ["read"] }).success).toBe(true);
		expect(viewerRole.authorize({ logs: ["read"] }).success).toBe(true);
	});
});

describe("validateOwnershipTransfer", () => {
	const base = {
		organizationOwnerId: "owner-1",
		actorUserId: "owner-1",
		actorRole: "owner",
		targetUserId: "admin-1",
		targetRole: "admin",
	};

	it("allows owner to transfer to an admin", () => {
		expect(validateOwnershipTransfer(base)).toEqual({
			newOwnerRole: "owner",
			previousOwnerRole: "admin",
		});
	});

	it("rejects transfers from non-owners", () => {
		expect(() =>
			validateOwnershipTransfer({
				...base,
				actorUserId: "admin-1",
				organizationOwnerId: "owner-1",
			}),
		).toThrow();
	});

	it("rejects transfers to non-members", () => {
		expect(() =>
			validateOwnershipTransfer({ ...base, targetRole: null }),
		).toThrow();
	});

	it("rejects self-transfer and transfers to existing owners", () => {
		expect(() =>
			validateOwnershipTransfer({ ...base, targetUserId: "owner-1" }),
		).toThrow();
		expect(() =>
			validateOwnershipTransfer({ ...base, targetRole: "owner" }),
		).toThrow();
	});
});

describe("validateRoleTransition", () => {
	it("rejects self role changes", () => {
		expect(() =>
			validateRoleTransition({
				actorRole: "owner",
				targetCurrentRole: "member",
				newRole: "admin",
				isSelf: true,
			}),
		).toThrow();
	});

	it("routes owner changes through transferOwnership", () => {
		expect(() =>
			validateRoleTransition({
				actorRole: "owner",
				targetCurrentRole: "member",
				newRole: "owner",
				isSelf: false,
			}),
		).toThrow();
		expect(() =>
			validateRoleTransition({
				actorRole: "owner",
				targetCurrentRole: "owner",
				newRole: "admin",
				isSelf: false,
			}),
		).toThrow();
	});

	it("prevents admins from changing other admins", () => {
		expect(() =>
			validateRoleTransition({
				actorRole: "admin",
				targetCurrentRole: "admin",
				newRole: "member",
				isSelf: false,
			}),
		).toThrow();
	});

	it("allows owner to assign the viewer role", () => {
		expect(() =>
			validateRoleTransition({
				actorRole: "owner",
				targetCurrentRole: "member",
				newRole: "viewer",
				isSelf: false,
			}),
		).not.toThrow();
	});

	it("validates custom roles via roleExists", () => {
		expect(() =>
			validateRoleTransition({
				actorRole: "owner",
				targetCurrentRole: "member",
				newRole: "support",
				isSelf: false,
				roleExists: () => false,
			}),
		).toThrow();
		expect(() =>
			validateRoleTransition({
				actorRole: "owner",
				targetCurrentRole: "member",
				newRole: "support",
				isSelf: false,
				roleExists: (r) => r === "support",
			}),
		).not.toThrow();
	});
});

describe("normalizeInviteEmails (team-based bulk invitations)", () => {
	it("lowercases, trims, and dedupes", () => {
		expect(normalizeInviteEmails(["A@x.com", " a@x.com ", "B@x.com"])).toEqual([
			"a@x.com",
			"b@x.com",
		]);
	});

	it("rejects invalid and empty lists", () => {
		expect(() => normalizeInviteEmails(["not-an-email"])).toThrow();
		expect(() => normalizeInviteEmails(["  "])).toThrow();
	});

	it("caps bulk invitations at 100", () => {
		expect(() =>
			normalizeInviteEmails(
				Array.from({ length: 101 }, (_, i) => `user${i}@x.com`),
			),
		).toThrow();
	});
});

describe("filterExpiredInvitations", () => {
	it("returns only pending invitations past expiry", () => {
		const now = new Date("2026-01-01T00:00:00Z");
		const rows = [
			{
				id: "a",
				status: "pending",
				expiresAt: new Date("2025-12-31T00:00:00Z"),
			},
			{
				id: "b",
				status: "pending",
				expiresAt: new Date("2026-02-01T00:00:00Z"),
			},
			{
				id: "c",
				status: "accepted",
				expiresAt: new Date("2025-01-01T00:00:00Z"),
			},
		];
		expect(filterExpiredInvitations(rows, now).map((r) => r.id)).toEqual(["a"]);
	});

	it("rejects a future purge cutoff", () => {
		const now = new Date("2026-01-01T00:00:00Z");
		expect(() =>
			validateInvitationCutoff(new Date("2026-01-02T00:00:00Z"), now),
		).toThrow("cannot be in the future");
		expect(validateInvitationCutoff(undefined, now)).toBe(now);
	});
});

describe("validateTeamCapacity (team size limits)", () => {
	it("allows unlimited teams", () => {
		expect(() => validateTeamCapacity(500, null, 10)).not.toThrow();
		expect(() => validateTeamCapacity(500, undefined, 10)).not.toThrow();
	});

	it("rejects over-capacity moves", () => {
		expect(() => validateTeamCapacity(4, 5, 1)).not.toThrow();
		expect(() => validateTeamCapacity(5, 5, 1)).toThrow();
	});

	it("rejects invalid limits", () => {
		expect(() => validateTeamCapacity(0, 0, 0)).toThrow();
	});
});

describe("sanitizeTeamName + resolveMemberServers", () => {
	it("trims names and enforces length", () => {
		expect(sanitizeTeamName("  Frontend  ")).toBe("Frontend");
		expect(() => sanitizeTeamName("   ")).toThrow();
		expect(() => sanitizeTeamName("x".repeat(101))).toThrow();
	});

	it("recognizes direct and wrapped unique constraint errors", () => {
		expect(isUniqueConstraintError({ code: "23505" })).toBe(true);
		expect(isUniqueConstraintError({ cause: { code: "23505" } })).toBe(true);
		expect(isUniqueConstraintError({ code: "22001" })).toBe(false);
	});

	it("unions member and team servers for team-wide access", () => {
		expect(resolveMemberServers(["s1", "s2"], ["s2", "s3"])).toEqual([
			"s1",
			"s2",
			"s3",
		]);
		expect(resolveMemberServers(["s1"], null)).toEqual(["s1"]);
	});
});
