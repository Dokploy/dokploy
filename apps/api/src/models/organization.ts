import { Schema, model, Document, Types } from 'mongoose';
import { Role } from './role';

export interface IOrganization extends Document {
  name: string;
  description?: string;
  owner: Types.ObjectId; // User who owns the organization
  teams: Types.ObjectId[]; // References to Team documents
  createdAt: Date;
  updatedAt: Date;
}

const OrganizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    teams: [{ type: Schema.Types.ObjectId, ref: 'Team' }],
  },
  { timestamps: true },
);

export const Organization = model<IOrganization>('Organization', OrganizationSchema);
