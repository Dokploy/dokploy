import { createAccessControl } from "better-auth/plugins/access";

/**
 * Dokploy Access Control Statements
 *
 * Defines all resources and their possible actions across the platform.
 * The first 5 (organization, member, invitation, team, ac) are better-auth defaults
 * used internally by the organization plugin.
 * The rest are Dokploy-specific resources.
 */
export const statements = {
	// better-auth organization plugin defaults
	organization: ["update", "delete"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],

	// Dokploy resources
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	cloudflare: ["read", "create", "update", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	server: ["read", "create", "delete"],
	registry: ["read", "create", "delete"],
	certificate: ["read", "create", "update", "delete"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	destination: ["read", "create", "delete"],
	notification: ["read", "create", "update", "delete"],
	tag: ["read", "create", "update", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	auditLog: ["read"],
} as const;

export const enterpriseOnlyResources = new Set<string>([
	"volume",
	"deployment",
	"envVars",
	"projectEnvVars",
	"environmentEnvVars",
	"server",
	"registry",
	"certificate",
	"backup",
	"volumeBackup",
	"schedule",
	"domain",
	"destination",
	"notification",
	"tag",
	"logs",
	"monitoring",
	"auditLog",
]);

export const ac = createAccessControl(statements);

/**
 * Owner role — full access to everything
 */
export const ownerRole = ac.newRole({
	organization: ["update", "delete"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	cloudflare: ["read", "create", "update", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	server: ["read", "create", "delete"],
	registry: ["read", "create", "delete"],
	certificate: ["read", "create", "update", "delete"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	destination: ["read", "create", "delete"],
	notification: ["read", "create", "update", "delete"],
	tag: ["read", "create", "update", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	auditLog: ["read"],
});

/**
 * Admin role — same as owner but cannot delete the organization
 */
export const adminRole = ac.newRole({
	organization: ["update"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	cloudflare: ["read", "create", "update", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	server: ["read", "create", "delete"],
	registry: ["read", "create", "delete"],
	certificate: ["read", "create", "update", "delete"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	destination: ["read", "create", "delete"],
	notification: ["read", "create", "update", "delete"],
	tag: ["read", "create", "update", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	auditLog: ["read"],
});

/**
 * Member role — read-only base permissions for org-level resources,
 * full access for service-level operations on services they have access to.
 */
export const memberRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: ["read"],
	project: [],
	service: ["read"],
	environment: ["read"],
	docker: [],
	sshKeys: [],
	gitProviders: [],
	cloudflare: [],
	traefikFiles: [],
	api: [],
	// Service-level — member can do everything within services they have access to
	volume: ["read", "create", "delete"],
	deployment: ["read", "create", "cancel"],
	envVars: ["read", "write"],
	projectEnvVars: ["read", "write"],
	environmentEnvVars: ["read", "write"],
	backup: ["read", "create", "update", "delete", "restore"],
	volumeBackup: ["read", "create", "update", "delete", "restore"],
	schedule: ["read", "create", "update", "delete"],
	domain: ["read", "create", "delete"],
	logs: ["read"],
	monitoring: ["read"],
	// Org-level — member cannot manage these
	server: [],
	registry: [],
	certificate: [],
	destination: [],
	notification: [],
	tag: ["read"],
	auditLog: [],
});
