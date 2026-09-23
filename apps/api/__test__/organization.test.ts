import request from 'supertest';
import express from 'express';
import bodyParser from 'body-parser';
import organizationRoutes from '../src/routes/organization';
import { User } from '../src/models/user';
import { Organization } from '../src/models/organization';
import { Team } from '../src/models/team';
import mongoose from 'mongoose';

const app = express();
app.use(bodyParser.json());
app.use('/api/organizations', organizationRoutes);

beforeAll(async () => {
  await mongoose.connect('mongodb://localhost:27017/dokploy_test', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
});

describe('Organization API', () => {
  let ownerId: string;
  let orgId: string;
  let teamId: string;

  it('creates an organization', async () => {
    const owner = new User({ email: 'owner@example.com', passwordHash: 'hash' });
    await owner.save();
    ownerId = owner._id.toString();

    const res = await request(app)
      .post('/api/organizations')
      .set('x-user-id', ownerId)
      .send({ name: 'TestOrg', description: 'A test organization' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('TestOrg');
    orgId = res.body._id;
  });

  it('adds a team to the organization', async () => {
    const res = await request(app)
      .post(`/api/organizations/${orgId}/teams`)
      .set('x-user-id', ownerId)
      .send({ name: 'DevTeam', description: 'Development team', role: 'member', maxMembers: 5 });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('DevTeam');
    teamId = res.body._id;
  });

  it('adds a member to the team', async () => {
    const member = new User({ email: 'member@example.com', passwordHash: 'hash' });
    await member.save();

    const res = await request(app)
      .post(`/api/organizations/teams/${teamId}/members`)
      .set('x-user-id', ownerId)
      .send({ userId: member._id });

    expect(res.status).toBe(200);
    const updatedTeam = await Team.findById(teamId);
    expect(updatedTeam?.members).toContainEqual(member._id);
  });
});
