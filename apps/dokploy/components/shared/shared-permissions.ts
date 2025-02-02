import type { TeamRole } from "@dokploy/server/db/schema/team-schema";
import { z } from "zod";

// Base permission schema for both users and teams
export const basePermissionSchema = z.object({
	accesedProjects: z.array(z.string()).optional(),
	accesedServices: z.array(z.string()).optional(),
	canCreateProjects: z.boolean().optional().default(false),
	canCreateServices: z.boolean().optional().default(false),
	canDeleteProjects: z.boolean().optional().default(false),
	canDeleteServices: z.boolean().optional().default(false),
	canAccessToTraefikFiles: z.boolean().optional().default(false),
	canAccessToDocker: z.boolean().optional().default(false),
	canAccessToAPI: z.boolean().optional().default(false),
	canAccessToSSHKeys: z.boolean().optional().default(false),
	canAccessToGitProviders: z.boolean().optional().default(false),
});

// Team-specific permission schema that extends base permissions
export const teamPermissionSchema = basePermissionSchema.extend({
	canManageTeam: z.boolean().optional().default(false),
	canInviteMembers: z.boolean().optional().default(false),
	canRemoveMembers: z.boolean().optional().default(false),
	canEditTeamSettings: z.boolean().optional().default(false),
	canViewTeamResources: z.boolean().optional().default(false),
	canManageTeamResources: z.boolean().optional().default(false),
});

export type BasePermissions = z.infer<typeof basePermissionSchema>;
export type TeamPermissions = z.infer<typeof teamPermissionSchema>;

// Role-based default permissions
export const getDefaultPermissionsByRole = (
	role: TeamRole | undefined,
): BasePermissions => {
	switch (role) {
		case "OWNER":
			return {
				accesedProjects: [],
				accesedServices: [],
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: true,
				canDeleteServices: true,
				canAccessToTraefikFiles: true,
				canAccessToDocker: true,
				canAccessToAPI: true,
				canAccessToSSHKeys: true,
				canAccessToGitProviders: true,
			};
		case "ADMIN":
			return {
				accesedProjects: [],
				accesedServices: [],
				canCreateProjects: true,
				canCreateServices: true,
				canDeleteProjects: false,
				canDeleteServices: true,
				canAccessToTraefikFiles: true,
				canAccessToDocker: true,
				canAccessToAPI: true,
				canAccessToSSHKeys: true,
				canAccessToGitProviders: true,
			};
		case "MEMBER":
			return {
				accesedProjects: [],
				accesedServices: [],
				canCreateProjects: false,
				canCreateServices: true,
				canDeleteProjects: false,
				canDeleteServices: false,
				canAccessToTraefikFiles: true,
				canAccessToDocker: true,
				canAccessToAPI: true,
				canAccessToSSHKeys: false,
				canAccessToGitProviders: false,
			};
		default:
			return {
				accesedProjects: [],
				accesedServices: [],
				canCreateProjects: false,
				canCreateServices: false,
				canDeleteProjects: false,
				canDeleteServices: false,
				canAccessToTraefikFiles: false,
				canAccessToDocker: false,
				canAccessToAPI: false,
				canAccessToSSHKeys: false,
				canAccessToGitProviders: false,
			};
	}
};

// Get team-specific default permissions based on role
export const getTeamDefaultPermissionsByRole = (
	role: TeamRole,
): TeamPermissions => {
	const basePermissions = getDefaultPermissionsByRole(role);
	return {
		...basePermissions,
		canManageTeam: role === "OWNER" || role === "ADMIN",
		canInviteMembers: role === "OWNER" || role === "ADMIN",
		canRemoveMembers: role === "OWNER" || role === "ADMIN",
		canEditTeamSettings: role === "OWNER",
		canViewTeamResources: role !== "GUEST",
		canManageTeamResources: role === "OWNER" || role === "ADMIN",
	};
};
