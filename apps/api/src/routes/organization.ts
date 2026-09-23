import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { OrganizationService } from '../services/organizationService';
import { Role } from '../models/role';
import { User } from '../models/user';

const router = Router();
const orgService = new OrganizationService();

/**
 * Middleware to ensure the user is authenticated.
 * In the real codebase this would be replaced by the existing auth middleware.
 */
const requireAuth = async (req: Request, res: Response, next: Function) => {
  const userId = req.headers['x-user-id'] as string;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  const user = await User.findById(userId);
  if (!user) return res.status(401).json({ error: 'User not found' });
  (req as any).user = user;
  next();
};

/**
 * Create a new organization. Only authenticated users can create.
 */
router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { name, description } = req.body;
  const user = (req as any).user as typeof User;
  try {
    const org = await orgService.createOrganization(name, description, user._id);
    res.status(201).json(org);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * Transfer ownership of an organization.
 */
router.post('/:orgId/transfer', requireAuth, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const { newOwnerId } = req.body;
  const user = (req as any).user as typeof User;
  if (user.role !== Role.OWNER) {
    return res.status(403).json({ error: 'Only owner can transfer ownership' });
  }
  try {
    const org = await orgService.transferOwnership(new Types.ObjectId(orgId), new Types.ObjectId(newOwnerId));
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    res.json(org);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * Add a new team to an organization.
 */
router.post('/:orgId/teams', requireAuth, async (req: Request, res: Response) => {
  const { orgId } = req.params;
  const { name, description, role, maxMembers } = req.body;
  const user = (req as any).user as typeof User;
  if (user.role !== Role.OWNER && user.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Only owner or admin can add teams' });
  }
  try {
    const team = await orgService.addTeam(new Types.ObjectId(orgId), name, description, role as Role, maxMembers);
    res.status(201).json(team);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * Add a member to a team.
 */
router.post('/teams/:teamId/members', requireAuth, async (req: Request, res: Response) => {
  const { teamId } = req.params;
  const { userId } = req.body;
  const user = (req as any).user as typeof User;
  if (user.role !== Role.OWNER && user.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Only owner or admin can add members' });
  }
  try {
    const team = await orgService.addMemberToTeam(new Types.ObjectId(teamId), new Types.ObjectId(userId));
    if (!team) return res.status(404).json({ error: 'Team not found' });
    res.json(team);
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

/**
 * Move a member between teams.
 */
router.post('/teams/move', requireAuth, async (req: Request, res: Response) => {
  const { userId, fromTeamId, toTeamId } = req.body;
  const user = (req as any).user as typeof User;
  if (user.role !== Role.OWNER && user.role !== Role.ADMIN) {
    return res.status(403).json({ error: 'Only owner or admin can move members' });
  }
  try {
    await orgService.moveMemberBetweenTeams(new Types.ObjectId(userId), new Types.ObjectId(fromTeamId), new Types.ObjectId(toTeamId));
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

export default router;
