import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { findMemberById } from "./user";

// Define Dokploy-specific resources and actions
export const DOKPLOY_RESOURCES = {
	project: ["create", "read", "update", "delete", "access"],
	service: ["create", "read", "update", "delete", "access", "readonly"],
	environment: ["create", "read", "update", "delete", "access"],
	docker: ["access"],
	api: ["access"],
	ssh: ["access"],
	git: ["access"],
	traefik: ["access"],
} as const;

export type DokployResource = keyof typeof DOKPLOY_RESOURCES;
export type DokployAction = typeof DOKPLOY_RESOURCES[DokployResource][number];

export interface PermissionContext {
	userId: string;
	organizationId: string;
	resourceId?: string;
	resourceType?: DokployResource;
}

export interface PermissionResult {
	allowed: boolean;
	reason?: string;
	permissions?: string[];
}

/**
 * Unified Permission Service
 * Handles both Better Auth organization permissions and custom Dokploy permissions
 */
export class PermissionService {
	/**
	 * Check if user has permission for a specific resource and action
	 */
	async checkPermission(
		context: PermissionContext,
		action: DokployAction,
		resource: DokployResource
	): Promise<PermissionResult> {
		try {
			const member = await this.getMember(context.userId, context.organizationId);
			
			if (!member) {
				return {
					allowed: false,
					reason: "User not found in organization",
				};
			}

			// Owners and admins have full access
			if (member.role === "owner" || member.role === "admin") {
				return {
					allowed: true,
					permissions: ["*"],
				};
			}

			// Check custom Dokploy permissions
			const customPermission = await this.checkCustomPermission(member, action, resource, context);
			if (customPermission.allowed) {
				return customPermission;
			}

			// Check Better Auth organization permissions
			const orgPermission = await this.checkOrganizationPermission(member, action, resource, context);
			return orgPermission;

		} catch (error) {
			console.error("Permission check error:", error);
			return {
				allowed: false,
				reason: "Permission check failed",
			};
		}
	}

	/**
	 * Check custom Dokploy permissions
	 */
	private async checkCustomPermission(
		member: any,
		action: DokployAction,
		resource: DokployResource,
		context: PermissionContext
	): Promise<PermissionResult> {
		// Map actions to permission flags
		const permissionMap: Record<string, string> = {
			"project:create": "canCreateProjects",
			"project:delete": "canDeleteProjects",
			"service:create": "canCreateServices",
			"service:delete": "canDeleteServices",
			"service:readonly": "canReadOnlyServices",
			"docker:access": "canAccessToDocker",
			"api:access": "canAccessToAPI",
			"ssh:access": "canAccessToSSHKeys",
			"git:access": "canAccessToGitProviders",
			"traefik:access": "canAccessToTraefikFiles",
		};

		const permissionKey = `${resource}:${action}`;
		const permissionFlag = permissionMap[permissionKey];

		if (!permissionFlag) {
			return { allowed: false, reason: "Unknown permission" };
		}

		// Check if user has the permission flag
		if (!member[permissionFlag]) {
			return { allowed: false, reason: "Permission not granted" };
		}

		// Check resource-specific access
		if (context.resourceId) {
			const hasResourceAccess = await this.checkResourceAccess(member, resource, context.resourceId);
			if (!hasResourceAccess) {
				return { allowed: false, reason: "No access to specific resource" };
			}
		}

		return { allowed: true, permissions: [permissionKey] };
	}

	/**
	 * Check Better Auth organization permissions
	 */
	private async checkOrganizationPermission(
		member: any,
		action: DokployAction,
		resource: DokployResource,
		context: PermissionContext
	): Promise<PermissionResult> {
		// This would integrate with Better Auth's permission system
		// For now, we'll return false as we're keeping the custom system
		// In the future, this could check Better Auth's role-based permissions
		return { allowed: false, reason: "Using custom permission system" };
	}

	/**
	 * Check if user has access to a specific resource
	 */
	private async checkResourceAccess(
		member: any,
		resource: DokployResource,
		resourceId: string
	): Promise<boolean> {
		switch (resource) {
			case "project":
				return member.accessedProjects?.includes(resourceId) || false;
			case "service":
				return member.accessedServices?.includes(resourceId) || false;
			case "environment":
				return member.accessedEnvironments?.includes(resourceId) || false;
			default:
				return true; // For resources that don't need specific access control
		}
	}

	/**
	 * Get member with all permissions
	 */
	private async getMember(userId: string, organizationId: string) {
		return await db.query.member.findFirst({
			where: and(
				eq(schema.member.userId, userId),
				eq(schema.member.organizationId, organizationId)
			),
		});
	}

	/**
	 * Check service read-only permission (existing functionality)
	 */
	async checkServiceReadOnlyPermission(
		userId: string,
		serviceId: string,
		organizationId: string
	): Promise<boolean> {
		const result = await this.checkPermission(
			{ userId, organizationId, resourceId: serviceId, resourceType: "service" },
			"readonly",
			"service"
		);
		return result.allowed;
	}

	/**
	 * Check service access permission (existing functionality)
	 */
	async checkServiceAccess(
		userId: string,
		serviceId: string,
		organizationId: string,
		action: "access" | "create" | "delete" | "readonly" = "access"
	): Promise<boolean> {
		const result = await this.checkPermission(
			{ userId, organizationId, resourceId: serviceId, resourceType: "service" },
			action as DokployAction,
			"service"
		);
		return result.allowed;
	}

	/**
	 * Check environment access permission (existing functionality)
	 */
	async checkEnvironmentAccess(
		userId: string,
		environmentId: string,
		organizationId: string,
		action: "access" | "create" | "delete" = "access"
	): Promise<boolean> {
		const result = await this.checkPermission(
			{ userId, organizationId, resourceId: environmentId, resourceType: "environment" },
			action as DokployAction,
			"environment"
		);
		return result.allowed;
	}

	/**
	 * Get all permissions for a user
	 */
	async getUserPermissions(userId: string, organizationId: string): Promise<string[]> {
		const member = await this.getMember(userId, organizationId);
		if (!member) return [];

		const permissions: string[] = [];

		// Add custom permissions
		if (member.canCreateProjects) permissions.push("project:create");
		if (member.canDeleteProjects) permissions.push("project:delete");
		if (member.canCreateServices) permissions.push("service:create");
		if (member.canDeleteServices) permissions.push("service:delete");
		if (member.canReadOnlyServices) permissions.push("service:readonly");
		if (member.canAccessToDocker) permissions.push("docker:access");
		if (member.canAccessToAPI) permissions.push("api:access");
		if (member.canAccessToSSHKeys) permissions.push("ssh:access");
		if (member.canAccessToGitProviders) permissions.push("git:access");
		if (member.canAccessToTraefikFiles) permissions.push("traefik:access");

		return permissions;
	}

	/**
	 * Validate permission assignment
	 */
	async validatePermissionAssignment(
		userId: string,
		organizationId: string,
		permissions: Record<string, any>
	): Promise<{ valid: boolean; errors: string[] }> {
		const errors: string[] = [];
		const member = await this.getMember(userId, organizationId);

		if (!member) {
			errors.push("User not found in organization");
			return { valid: false, errors };
		}

		// Validate resource access arrays
		if (permissions.accessedProjects && Array.isArray(permissions.accessedProjects)) {
			// Validate that projects exist and user has access
			// This could be enhanced with actual project validation
		}

		if (permissions.accessedServices && Array.isArray(permissions.accessedServices)) {
			// Validate that services exist and user has access
		}

		if (permissions.accessedEnvironments && Array.isArray(permissions.accessedEnvironments)) {
			// Validate that environments exist and user has access
		}

		return { valid: errors.length === 0, errors };
	}
}

// Export singleton instance
export const permissionService = new PermissionService();

// Export convenience functions for backward compatibility
export const checkServiceReadOnlyPermission = permissionService.checkServiceReadOnlyPermission.bind(permissionService);
export const checkServiceAccess = permissionService.checkServiceAccess.bind(permissionService);
export const checkEnvironmentAccess = permissionService.checkEnvironmentAccess.bind(permissionService);
