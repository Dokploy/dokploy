import { Schema, model, Document, Types } from 'mongoose';
import { Role } from './role';

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  name?: string;
  organization?: Types.ObjectId; // Optional organization membership
  team?: Types.ObjectId; // Optional team membership
  role: Role; // Role within the organization
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true },
    passwordHash: { type: String, required: true },
    name: { type: String },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization' },
    team: { type: Schema.Types.ObjectId, ref: 'Team' },
    role: { type: String, enum: Object.values(Role), default: Role.MEMBER },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', UserSchema);
