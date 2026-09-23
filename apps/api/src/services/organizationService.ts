import { Organization, IOrganization } from '../models/organization';
import { Team, ITeam } from '../models/team';
import { User, IUser } from '../models/user';
import { Role } from '../models/role';
import { Types } from 'mongoose';

/**
 * Basic organization service layer. In a production system this would be
 * more feature‑rich and include validation, error handling, and permission checks.
 */
export class OrganizationService {
  async createOrganization(name: string, description: string, ownerId: Types.ObjectId): Promise<IOrganization> {
    const org = new Organization({ name, description, owner: ownerId });
    return await org.save();
  }

  async transferOwnership(orgId: Types.ObjectId, newOwnerId: Types.ObjectId): Promise<IOrganization | null> {
    const org = await Organization.findById(orgId);
    if (!org) return null;
    org.owner = newOwnerId;
    return await org.save();
  }

  async addTeam(orgId: Types.ObjectId, name: string, description: string, role: Role = Role.MEMBER, maxMembers = 0): Promise<ITeam> {
    const team = new Team({ name, description, organization: orgId, role, maxMembers });
    await team.save();
    await Organization.findByIdAndUpdate(orgId, { $push: { teams: team._id } });
    return team;
  }

  async addMemberToTeam(teamId: Types.ObjectId, userId: Types.ObjectId): Promise<ITeam | null> {
    const team = await Team.findById(teamId);
    if (!team) return null;
    if (team.maxMembers && team.members.length >= team.maxMembers) {
      throw new Error('Team size limit reached');
    }
    team.members.push(userId);
    await team.save();
    await User.findByIdAndUpdate(userId, { team: teamId });
    return team;
  }

  async moveMemberBetweenTeams(userId: Types.ObjectId, fromTeamId: Types.ObjectId, toTeamId: Types.ObjectId): Promise<void> {
    await Team.findByIdAndUpdate(fromTeamId, { $pull: { members: userId } });
    await Team.findByIdAndUpdate(toTeamId, { $addToSet: { members: userId } });
    await User.findByIdAndUpdate(userId, { team: toTeamId });
  }
}
