import { TRPCError } from "@trpc/server";
import { z } from "zod";

export const teamMetadataItemSchema = z.object({
	id: z.string().min(1),
	name: z.string().trim().min(2).max(64),
	description: z.string().trim().max(500).nullable().optional(),
	maxSize: z.number().int().min(1).max(1000).nullable().optional(),
	memberIds: z.array(z.string()).default([]),
});

export type TeamMetadataItem = z.infer<typeof teamMetadataItemSchema>;

export interface OrganizationMetadataEnvelope {
	description?: string | null;
	teams?: TeamMetadataItem[];
	[key: string]: unknown;
}

export const createTeamSchema = z.object({
	organizationId: z.string().min(1),
	name: z.string().trim().min(2).max(64),
	description: z.string().trim().max(500).nullable().optional(),
	maxSize: z.number().int().min(1).max(1000).nullable().optional(),
	initialMemberIds: z.array(z.string().min(1)).optional(),
});

export const updateTeamSchema = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
	name: z.string().trim().min(2).max(64).optional(),
	description: z.string().trim().max(500).nullable().optional(),
	maxSize: z.number().int().min(1).max(1000).nullable().optional(),
});

export const deleteTeamSchema = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
});

export const addTeamMemberSchema = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
	memberUserId: z.string().min(1),
});

export const removeTeamMemberSchema = z.object({
	organizationId: z.string().min(1),
	teamId: z.string().min(1),
	memberUserId: z.string().min(1),
});

export const moveTeamMemberSchema = z.object({
	organizationId: z.string().min(1),
	memberUserId: z.string().min(1),
	sourceTeamId: z.string().min(1),
	targetTeamId: z.string().min(1),
});

export const transferOwnershipSchema = z.object({
	organizationId: z.string().min(1),
	targetMemberId: z.string().min(1),
});

export const parseOrganizationMetadata = (
	raw: string | null | undefined,
): OrganizationMetadataEnvelope => {
	if (!raw) {
		return {};
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
			return parsed as OrganizationMetadataEnvelope;
		}
		return {};
	} catch {
		return {};
	}
};

export const readTeamsFromMetadata = (
	meta: OrganizationMetadataEnvelope,
): TeamMetadataItem[] => {
	if (!Array.isArray(meta.teams)) {
		return [];
	}
	const validTeams: TeamMetadataItem[] = [];
	for (const item of meta.teams) {
		const parsed = teamMetadataItemSchema.safeParse(item);
		if (parsed.success) {
			validTeams.push(parsed.data);
		}
	}
	return validTeams;
};

export const applyTeamMemberAdd = (
	teams: TeamMetadataItem[],
	input: { teamId: string; memberUserId: string },
	options?: {
		activeMemberUserIds?: Set<string>;
		pendingInvitationCount?: number;
	},
): {
	updatedTeam: TeamMetadataItem;
	nextTeams: TeamMetadataItem[];
} => {
	const teamIndex = teams.findIndex((team) => team.id === input.teamId);
	const targetTeam = teamIndex !== -1 ? teams[teamIndex] : undefined;

	if (!targetTeam) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Team not found in this organization",
		});
	}

	if (targetTeam.memberIds.includes(input.memberUserId)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "User is already a member of this team",
		});
	}

	const activeIds = options?.activeMemberUserIds
		? targetTeam.memberIds.filter((id) => options.activeMemberUserIds!.has(id))
		: targetTeam.memberIds;
	const pendingCount = options?.pendingInvitationCount ?? 0;

	if (
		targetTeam.maxSize !== null &&
		targetTeam.maxSize !== undefined &&
		activeIds.length + pendingCount >= targetTeam.maxSize
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Team "${targetTeam.name}" has reached its maximum size limit of ${targetTeam.maxSize}`,
		});
	}

	// Remove from any existing team so each member belongs to at most one team
	const nextTeams = teams.map((team) => {
		const baseMemberIds = options?.activeMemberUserIds
			? team.memberIds.filter((id) => options.activeMemberUserIds!.has(id))
			: team.memberIds;

		if (team.id === input.teamId) {
			return {
				...team,
				memberIds: [
					...baseMemberIds.filter((id) => id !== input.memberUserId),
					input.memberUserId,
				],
			};
		}
		if (baseMemberIds.includes(input.memberUserId)) {
			return {
				...team,
				memberIds: baseMemberIds.filter((id) => id !== input.memberUserId),
			};
		}
		return {
			...team,
			memberIds: baseMemberIds,
		};
	});

	const updatedTeam = nextTeams.find((t) => t.id === input.teamId)!;

	return {
		updatedTeam,
		nextTeams,
	};
};

export const applyTeamMemberRemove = (
	teams: TeamMetadataItem[],
	input: { teamId: string; memberUserId: string },
): {
	updatedTeam: TeamMetadataItem;
	nextTeams: TeamMetadataItem[];
} => {
	const teamIndex = teams.findIndex((team) => team.id === input.teamId);
	const targetTeam = teamIndex !== -1 ? teams[teamIndex] : undefined;

	if (!targetTeam) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Team not found in this organization",
		});
	}

	if (!targetTeam.memberIds.includes(input.memberUserId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "User is not a member of this team",
		});
	}

	const updatedTeam: TeamMetadataItem = {
		...targetTeam,
		memberIds: targetTeam.memberIds.filter((id) => id !== input.memberUserId),
	};

	const nextTeams = [...teams];
	nextTeams[teamIndex] = updatedTeam;

	return {
		updatedTeam,
		nextTeams,
	};
};

export const applyTeamMemberMove = (
	teams: TeamMetadataItem[],
	input: z.infer<typeof moveTeamMemberSchema>,
	options?: {
		activeMemberUserIds?: Set<string>;
		pendingInvitationCount?: number;
	},
): {
	sourceTeam: TeamMetadataItem;
	targetTeam: TeamMetadataItem;
	nextTeams: TeamMetadataItem[];
} => {
	if (input.sourceTeamId === input.targetTeamId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Source and target teams must be different",
		});
	}

	const sourceIdx = teams.findIndex((team) => team.id === input.sourceTeamId);
	const targetIdx = teams.findIndex((team) => team.id === input.targetTeamId);

	const sourceTeam = sourceIdx !== -1 ? teams[sourceIdx] : undefined;
	const targetTeam = targetIdx !== -1 ? teams[targetIdx] : undefined;

	if (!sourceTeam) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Source team not found in this organization",
		});
	}
	if (!targetTeam) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Target team not found in this organization",
		});
	}

	if (!sourceTeam.memberIds.includes(input.memberUserId)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "User is not a member of the source team",
		});
	}

	if (targetTeam.memberIds.includes(input.memberUserId)) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "User is already a member of the target team",
		});
	}

	const targetActiveIds = options?.activeMemberUserIds
		? targetTeam.memberIds.filter((id) => options.activeMemberUserIds!.has(id))
		: targetTeam.memberIds;
	const pendingCount = options?.pendingInvitationCount ?? 0;

	if (
		targetTeam.maxSize !== null &&
		targetTeam.maxSize !== undefined &&
		targetActiveIds.length + pendingCount >= targetTeam.maxSize
	) {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message: `Target team "${targetTeam.name}" has reached its maximum size limit of ${targetTeam.maxSize}`,
		});
	}

	const updatedSource: TeamMetadataItem = {
		...sourceTeam,
		memberIds: sourceTeam.memberIds.filter((id) => id !== input.memberUserId),
	};
	const updatedTarget: TeamMetadataItem = {
		...targetTeam,
		memberIds: [...targetTeam.memberIds, input.memberUserId],
	};

	const nextTeams = [...teams];
	nextTeams[sourceIdx] = updatedSource;
	nextTeams[targetIdx] = updatedTarget;

	return {
		sourceTeam: updatedSource,
		targetTeam: updatedTarget,
		nextTeams,
	};
};

export const filterStaleInvitationIds = (
	invitations: ReadonlyArray<{
		id: string;
		status: string;
		expiresAt: Date;
	}>,
	now: Date = new Date(),
): string[] => {
	return invitations
		.filter(
			(inv) =>
				inv.status === "expired" ||
				inv.status === "canceled" ||
				(inv.status === "pending" && inv.expiresAt <= now),
		)
		.map((inv) => inv.id);
};
