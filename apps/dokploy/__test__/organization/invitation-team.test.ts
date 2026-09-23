import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	findInvitation: vi.fn(),
	findTeam: vi.fn(),
	setMember: vi.fn(),
	whereMember: vi.fn(),
}));

vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			invitation: { findFirst: mocks.findInvitation },
			team: { findFirst: mocks.findTeam },
		},
		update: vi.fn(() => ({
			set: mocks.setMember.mockReturnValue({ where: mocks.whereMember }),
		})),
	},
}));

const { assignAcceptedInvitationTeam } = await import(
	"@dokploy/server/services/invitation-team"
);

beforeEach(() => {
	vi.clearAllMocks();
});

describe("assignAcceptedInvitationTeam", () => {
	it("assigns the accepted member to the invitation team", async () => {
		mocks.findInvitation.mockResolvedValue({
			organizationId: "org-1",
			teamId: "team-1",
		});
		mocks.findTeam.mockResolvedValue({ id: "team-1" });

		await assignAcceptedInvitationTeam("invitation-1", "member-1");

		expect(mocks.setMember).toHaveBeenCalledWith({ teamId: "team-1" });
		expect(mocks.whereMember).toHaveBeenCalledOnce();
	});

	it("leaves the member unassigned without a valid team", async () => {
		mocks.findInvitation.mockResolvedValue({
			organizationId: "org-1",
			teamId: null,
		});
		await assignAcceptedInvitationTeam("invitation-1", "member-1");
		expect(mocks.findTeam).not.toHaveBeenCalled();
		expect(mocks.setMember).not.toHaveBeenCalled();

		mocks.findInvitation.mockResolvedValue({
			organizationId: "org-1",
			teamId: "deleted-team",
		});
		mocks.findTeam.mockResolvedValue(null);
		await assignAcceptedInvitationTeam("invitation-2", "member-2");
		expect(mocks.setMember).not.toHaveBeenCalled();
	});
});
