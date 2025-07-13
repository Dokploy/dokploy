export const PERMISSIONS = {
	PROJECT: {
		VIEW: {
			name: "project:view",
			description: "View projects",
		},
		CREATE: {
			name: "project:create",
			description: "Create projects",
		},
		DELETE: {
			name: "project:delete",
			description: "Delete projects",
		},
	},
	SERVICE: {
		VIEW: {
			name: "service:view",
			description: "View services",
		},
		CREATE: {
			name: "service:create",
			description: "Create services",
		},
		DELETE: {
			name: "service:delete",
			description: "Delete services",
		},
	},
	TRAEFIK: {
		ACCESS: {
			name: "traefik_files:access",
			description: "Access traefik files",
		},
	},
	DOCKER: {
		VIEW: {
			name: "docker:view",
			description: "View docker",
		},
	},
	API: {
		ACCESS: {
			name: "api:access",
			description: "Access API",
		},
	},
	SCHEDULES: {
		ACCESS: {
			name: "schedules:access",
			description: "Access schedules",
		},
	},
	GIT_PROVIDERS: {
		ACCESS: {
			name: "git_providers:access",
			description: "Access git providers",
		},
	},
	SSH_KEYS: {
		ACCESS: {
			name: "ssh_keys:access",
			description: "Access ssh keys",
		},
	},
} as const;

export const ownerPermissions = [
	PERMISSIONS.PROJECT.VIEW,
	PERMISSIONS.PROJECT.CREATE,
	PERMISSIONS.PROJECT.DELETE,
	PERMISSIONS.SERVICE.VIEW,
	PERMISSIONS.SERVICE.CREATE,
	PERMISSIONS.SERVICE.DELETE,
	PERMISSIONS.TRAEFIK.ACCESS,
	PERMISSIONS.SCHEDULES.ACCESS,
	PERMISSIONS.GIT_PROVIDERS.ACCESS,
	PERMISSIONS.SSH_KEYS.ACCESS,
] as const;

export const adminPermissions = [
	PERMISSIONS.PROJECT.VIEW,
	PERMISSIONS.PROJECT.CREATE,
	PERMISSIONS.PROJECT.DELETE,
	PERMISSIONS.SERVICE.VIEW,
	PERMISSIONS.SERVICE.CREATE,
	PERMISSIONS.SERVICE.DELETE,
	PERMISSIONS.TRAEFIK.ACCESS,
	PERMISSIONS.DOCKER.VIEW,
	PERMISSIONS.API.ACCESS,
	PERMISSIONS.SCHEDULES.ACCESS,
	PERMISSIONS.GIT_PROVIDERS.ACCESS,
	PERMISSIONS.SSH_KEYS.ACCESS,
] as const;

export const memberPermissions = [
	PERMISSIONS.PROJECT.CREATE,
	PERMISSIONS.SERVICE.CREATE,
	PERMISSIONS.TRAEFIK.ACCESS,
] as const;

export const defaultPermissions = [
	{
		name: "owner",
		description: "Owner of the organization with full access to all features",
		permissions: ownerPermissions,
	},
	{
		name: "admin",
		description:
			"Administrator with access to manage projects, services and configurations",
		permissions: adminPermissions,
	},
	{
		name: "member",
		description:
			"Regular member with access to create projects and manage services",
		permissions: memberPermissions,
	},
] as const;

// Utility type to extract all permission names
type ExtractPermissionNames<T> = T extends { name: infer U }
	? U
	: T extends object
		? {
				[K in keyof T]: ExtractPermissionNames<T[K]>;
			}[keyof T]
		: never;

export type PermissionName = ExtractPermissionNames<typeof PERMISSIONS>;
