/**
 * Role definitions for organization and team access control.
 * 
 * - OWNER: Full control over the organization and all its resources.
 * - ADMIN: Can manage teams, users, and permissions but cannot delete the organization.
 * - USER: View‑only access to assigned domains and optional start/stop container permission.
 * - MEMBER: Basic member role with default permissions.
 */
export enum Role {
  OWNER = 'owner',
  ADMIN = 'admin',
  USER = 'user',
  MEMBER = 'member',
}
