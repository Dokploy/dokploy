import { Schema, model, Document, Types } from 'mongoose';
import { Role } from './role';

export interface ITeam extends Document {
  name: string;
  description?: string;
  organization: Types.ObjectId; // Reference to Organization
  members: Types.ObjectId[]; // References to User documents
  role: Role; // Default role for new members added to this team
  maxMembers?: number; // Optional team size limit
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema<ITeam>(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    members: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    role: { type: String, enum: Object.values(Role), default: Role.MEMBER },
    maxMembers: { type: Number, default: 0 }, // 0 means unlimited
  },
  { timestamps: true },
);

export const Team = model<ITeam>('Team', TeamSchema);
