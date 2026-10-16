import { describe, expect, it } from "vitest";
import {
	applyTeamMemberAdd,
	applyTeamMemberMove,
	applyTeamMemberRemove,
	createTeamSchema,
	filterStaleInvitationIds,
	parseOrganizationMetadata,
	readTeamsFromMetadata,
	type TeamMetadataItem,
	teamMetadataItemSchema,
	updateTeamSchema,
} from "../../server/api/routers/organization-teams";

describe("organization-teams schemas & helpers", () => {
	describe("teamMetadataItemSchema", () => {
		it("accepts valid team metadata with trimmed name", () => {
			const result = teamMetadataItemSchema.safeParse({
				id: "team-1",
				name: "  DevOps  ",
				description: "  Infrastructure team  ",
				maxSize: 10,
				memberIds: ["user-1"],
			});
			expect(result.success).toBe(true);
			if (result.success) {
				expect(result.data.name).toBe("DevOps");
				expect(result.data.description).toBe("Infrastructure team");
			}
		});

		it("rejects names that become shorter than 2 characters after trimming", () => {
			const result = teamMetadataItemSchema.safeParse({
				id: "team-1",
				name: "  a  ",
			});
			expect(result.success).toBe(false);
		});

		it("rejects names longer than 64 characters", () => {
			const result = teamMetadataItemSchema.safeParse({
				id: "team-1",
				name: "a".repeat(65),
			});
			expect(result.success).toBe(false);
		});

		it("rejects invalid maxSize values", () => {
			const zeroSize = teamMetadataItemSchema.safeParse({
				id: "team-1",
				name: "Team Zero",
				maxSize: 0,
			});
			expect(zeroSize.success).toBe(false);

			const floatSize = teamMetadataItemSchema.safeParse({
				id: "team-1",
				name: "Team Float",
				maxSize: 3.5,
			});
			expect(floatSize.success).toBe(false);
		});
	});

	describe("createTeamSchema and updateTeamSchema", () => {
		it("trims and validates createTeam name", () => {
			const valid = createTeamSchema.safeParse({
				organizationId: "org-1",
				name: "  Backend Core  ",
				maxSize: 5,
			});
			expect(valid.success).toBe(true);
			if (valid.success) {
				expect(valid.data.name).toBe("Backend Core");
			}

			const invalid = createTeamSchema.safeParse({
				organizationId: "org-1",
				name: "   x   ",
			});
			expect(invalid.success).toBe(false);
		});

		it("trims and validates updateTeam name", () => {
			const valid = updateTeamSchema.safeParse({
				organizationId: "org-1",
				teamId: "team-1",
				name: "  Frontend Web  ",
			});
			expect(valid.success).toBe(true);
			if (valid.success) {
				expect(valid.data.name).toBe("Frontend Web");
			}
		});
	});

	describe("parseOrganizationMetadata and readTeamsFromMetadata", () => {
		it("handles null, undefined, and invalid JSON safely", () => {
			expect(parseOrganizationMetadata(null)).toEqual({});
			expect(parseOrganizationMetadata(undefined)).toEqual({});
			expect(parseOrganizationMetadata("")).toEqual({});
			expect(parseOrganizationMetadata("not-json")).toEqual({});
			expect(parseOrganizationMetadata("[]")).toEqual({});
		});

		it("parses valid metadata envelope and extracts valid teams", () => {
			const raw = JSON.stringify({
				description: "My Organization",
				teams: [
					{
						id: "team-1",
						name: "  Alpha  ",
						memberIds: ["u1"],
					},
					{
						id: "invalid-team",
						name: " ", // Fails validation
					},
				],
			});
			const meta = parseOrganizationMetadata(raw);
			expect(meta.description).toBe("My Organization");

			const teams = readTeamsFromMetadata(meta);
			expect(teams).toHaveLength(1);
			expect(teams[0]?.id).toBe("team-1");
			expect(teams[0]?.name).toBe("Alpha");
		});
	});

	describe("applyTeamMemberAdd", () => {
		const baseTeams: TeamMetadataItem[] = [
			{
				id: "t1",
				name: "Team 1",
				description: null,
				maxSize: 2,
				memberIds: [],
			},
			{
				id: "t2",
				name: "Team 2",
				description: null,
				maxSize: null,
				memberIds: ["u-existing"],
			},
		];

		it("successfully adds first member to empty team", () => {
			const result = applyTeamMemberAdd(baseTeams, {
				teamId: "t1",
				memberUserId: "u1",
			});
			expect(result.updatedTeam.memberIds).toEqual(["u1"]);
			expect(result.nextTeams.find((t) => t.id === "t1")?.memberIds).toEqual([
				"u1",
			]);
		});

		it("throws CONFLICT if user is already a member", () => {
			expect(() =>
				applyTeamMemberAdd(baseTeams, {
					teamId: "t2",
					memberUserId: "u-existing",
				}),
			).toThrowError("User is already a member of this team");
		});

		it("throws PRECONDITION_FAILED if team capacity maxSize is reached", () => {
			const fullTeams: TeamMetadataItem[] = [
				{
					id: "t1",
					name: "Team 1",
					description: null,
					maxSize: 1,
					memberIds: ["u-full"],
				},
			];
			expect(() =>
				applyTeamMemberAdd(fullTeams, {
					teamId: "t1",
					memberUserId: "u-new",
				}),
			).toThrowError(/maximum size limit of 1/);
		});

		it("removes user from previous team when added to another team", () => {
			const result = applyTeamMemberAdd(baseTeams, {
				teamId: "t1",
				memberUserId: "u-existing",
			});
			expect(result.nextTeams.find((t) => t.id === "t1")?.memberIds).toEqual([
				"u-existing",
			]);
			expect(result.nextTeams.find((t) => t.id === "t2")?.memberIds).toEqual(
				[],
			);
		});
	});

	describe("applyTeamMemberRemove", () => {
		const baseTeams: TeamMetadataItem[] = [
			{
				id: "t1",
				name: "Team 1",
				description: null,
				maxSize: null,
				memberIds: ["u1", "u2"],
			},
		];

		it("removes member from team", () => {
			const result = applyTeamMemberRemove(baseTeams, {
				teamId: "t1",
				memberUserId: "u1",
			});
			expect(result.updatedTeam.memberIds).toEqual(["u2"]);
		});

		it("throws BAD_REQUEST if user is not in team", () => {
			expect(() =>
				applyTeamMemberRemove(baseTeams, {
					teamId: "t1",
					memberUserId: "u-unknown",
				}),
			).toThrowError("User is not a member of this team");
		});
	});

	describe("applyTeamMemberMove", () => {
		const baseTeams: TeamMetadataItem[] = [
			{
				id: "t1",
				name: "Source Team",
				description: null,
				maxSize: null,
				memberIds: ["u1"],
			},
			{
				id: "t2",
				name: "Target Team",
				description: null,
				maxSize: 2,
				memberIds: ["u2"],
			},
		];

		it("moves member between teams", () => {
			const result = applyTeamMemberMove(baseTeams, {
				organizationId: "org-1",
				memberUserId: "u1",
				sourceTeamId: "t1",
				targetTeamId: "t2",
			});
			expect(result.sourceTeam.memberIds).toEqual([]);
			expect(result.targetTeam.memberIds).toEqual(["u2", "u1"]);
		});

		it("throws BAD_REQUEST when source and target teams are identical", () => {
			expect(() =>
				applyTeamMemberMove(baseTeams, {
					organizationId: "org-1",
					memberUserId: "u1",
					sourceTeamId: "t1",
					targetTeamId: "t1",
				}),
			).toThrowError("Source and target teams must be different");
		});

		it("throws BAD_REQUEST when member is not in source team", () => {
			expect(() =>
				applyTeamMemberMove(baseTeams, {
					organizationId: "org-1",
					memberUserId: "u-missing",
					sourceTeamId: "t1",
					targetTeamId: "t2",
				}),
			).toThrowError("User is not a member of the source team");
		});

		it("throws PRECONDITION_FAILED when target team is full", () => {
			const fullTargetTeams: TeamMetadataItem[] = [
				{
					id: "t1",
					name: "Source Team",
					description: null,
					maxSize: null,
					memberIds: ["u1"],
				},
				{
					id: "t2",
					name: "Target Team",
					description: null,
					maxSize: 1,
					memberIds: ["u2"],
				},
			];
			expect(() =>
				applyTeamMemberMove(fullTargetTeams, {
					organizationId: "org-1",
					memberUserId: "u1",
					sourceTeamId: "t1",
					targetTeamId: "t2",
				}),
			).toThrowError(/maximum size limit of 1/);
		});
	});

	describe("filterStaleInvitationIds", () => {
		it("correctly identifies expired, canceled, and past-due invitations", () => {
			const now = new Date("2026-10-16T12:00:00Z");
			const invitations = [
				{
					id: "inv-expired",
					status: "expired",
					expiresAt: new Date("2026-10-15T12:00:00Z"),
				},
				{
					id: "inv-canceled",
					status: "canceled",
					expiresAt: new Date("2026-10-18T12:00:00Z"),
				},
				{
					id: "inv-past-due-pending",
					status: "pending",
					expiresAt: new Date("2026-10-16T11:59:59Z"),
				},
				{
					id: "inv-active-pending",
					status: "pending",
					expiresAt: new Date("2026-10-17T12:00:00Z"),
				},
			];

			const stale = filterStaleInvitationIds(invitations, now);
			expect(stale).toEqual([
				"inv-expired",
				"inv-canceled",
				"inv-past-due-pending",
			]);
		});
	});
});
