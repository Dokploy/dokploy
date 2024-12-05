import { relations } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { z } from "zod";

export const teams = pgTable("teams", {
	id: uuid("team_id").primaryKey().notNull().defaultRandom(),
	name: text("name").notNull(),
	description: text("description"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

export const teamInvitations = pgTable("team_invitations", {
	id: uuid("id").primaryKey().defaultRandom(),
	teamId: uuid("team_id")
		.notNull()
		.references(() => teams.id, { onDelete: "cascade" }),
	email: text("email"),
	role: text("role", { enum: ["ADMIN", "MEMBER", "GUEST"] }).notNull(),
	token: text("token").notNull(),
	inviteLink: text("invite_link").notNull(),
	type: text("type", { enum: ["EMAIL", "LINK"] }).notNull(),
	status: text("status", { enum: ["PENDING", "ACCEPTED", "EXPIRED"] })
		.notNull()
		.default("PENDING"),
	expiresAt: timestamp("expires_at").notNull(),
	createdAt: timestamp("created_at").defaultNow(),
});

export const teamMembers = pgTable("team_members", {
	teamId: uuid("team_id")
		.notNull()
		.references(() => teams.id, {
			onDelete: "cascade",
			onUpdate: "no action",
		}),
	userId: text("user_id").notNull(),
	role: text("role", { enum: ["OWNER", "ADMIN", "MEMBER", "GUEST"] }).notNull(),
	canManageTeam: boolean("can_manage_team").notNull().default(false),
	canInviteMembers: boolean("can_invite_members").notNull().default(false),
	canRemoveMembers: boolean("can_remove_members").notNull().default(false),
	canEditTeamSettings: boolean("can_edit_team_settings")
		.notNull()
		.default(false),
	canViewTeamResources: boolean("can_view_team_resources")
		.notNull()
		.default(false),
	canManageTeamResources: boolean("can_manage_team_resources")
		.notNull()
		.default(false),
	canCreateProjects: boolean("can_create_projects").notNull().default(false),
	canCreateServices: boolean("can_create_services").notNull().default(false),
	canDeleteProjects: boolean("can_delete_projects").notNull().default(false),
	canDeleteServices: boolean("can_delete_services").notNull().default(false),
	canAccessToTraefikFiles: boolean("can_access_to_traefik_files")
		.notNull()
		.default(false),
	canAccessToDocker: boolean("can_access_to_docker").notNull().default(false),
	canAccessToAPI: boolean("can_access_to_api").notNull().default(false),
	canAccessToSSHKeys: boolean("can_access_to_ssh_keys")
		.notNull()
		.default(false),
	canAccessToGitProviders: boolean("can_access_to_git_providers")
		.notNull()
		.default(false),
	accesedProjects: text("accesed_projects").array(),
	accesedServices: text("accesed_services").array(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const teamInvitationsRelations = relations(
	teamInvitations,
	({ one }) => ({
		team: one(teams, {
			fields: [teamInvitations.teamId],
			references: [teams.id],
		}),
	}),
);

export type TeamRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
export type AssignableTeamRole = "OWNER" | "ADMIN" | "MEMBER" | "GUEST";
export const teamRoles: AssignableTeamRole[] = [
	"OWNER",
	"ADMIN",
	"MEMBER",
	"GUEST",
];
export const allTeamRoles = ["OWNER", "ADMIN", "MEMBER", "GUEST"] as const;

export interface TeamInvitation {
	id: string;
	email: string;
	role: TeamRole;
	token: string;
	status: string;
	expiresAt: string | Date;
}

export interface TeamMember {
	userId: string;
	role: TeamRole;
	expirationDate: string | Date;
	user: {
		userId: string;
		email: string;
		name: string;
		isRegistered: boolean;
		auth: {
			is2FAEnabled: boolean;
		};
	};
}

export interface Team {
	id: string;
	name: string;
	description: string | null;
	createdAt: Date | null;
	updatedAt: Date | null;
	members: TeamMember[];
	invitations?: TeamInvitation[];
}

// Custom schema for team creation/update
export const teamSchema = z.object({
	name: z.string().min(1, "Name is required"),
	description: z.string().nullable().optional(),
});

export const updateTeamSchema = teamSchema.extend({
	teamId: z.string().uuid(),
});

export const teamMemberSchema = z.object({
	teamId: z.string().uuid(),
	userId: z.string(),
	role: z.enum(["OWNER", "ADMIN", "MEMBER", "GUEST"]).default("GUEST"),
});
// Update the team creation service to automatically add owner as a member
export const createTeam = async (
	userId: string,
	data: { name: string; description?: string },
) => {
	return await db!.transaction(async (tx) => {
		const [team] = await tx
			.insert(teams)
			.values({
				name: data.name,
				description: data.description,
			})
			.returning();
	});
};
