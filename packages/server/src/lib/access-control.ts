import { createAccessControl } from "better-auth/plugins/access";

/**
 * Dokploy Access Control Statements
 *
 * Defines all resources and their possible actions across the platform.
 * The first 5 (organization, member, invitation, team, ac) are better-auth defaults
 * used internally by the organization plugin.
 * The rest are Dokploy-specific resources.
 *
 * Enterprise-only resources (only assignable via custom roles):
 * deployment, envVars, server, registry, certificate, backup, domain, logs, monitoring
 */
export const statements = {
	// better-auth organization plugin defaults
	organization: ["update", "delete"],
	member: ["read", "create", "update", "delete"],
	invitation: ["create", "cancel"],
	team: ["create", "update", "delete"],
	ac: ["create", "read", "update", "delete"],

	// Dokploy core resources (free tier)
	project: ["create", "delete"],
	service: ["create", "read", "delete"],
	environment: ["create", "read", "delete"],
	docker: ["read"],
	sshKeys: ["read", "create", "delete"],
	gitProviders: ["read", "create", "delete"],
	traefikFiles: ["read", "write"],
	api: ["read"],

	// Enterprise-only resources (custom roles only)
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

/**
 * Enterprise-only resources. Built-in roles can reference these resources
 * without requiring an enterprise license.
 */
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
 * Member role (free tier) — read-only base permissions.
 * Members can read projects/services/environments they have access to,
 * but cannot create, delete, or access admin resources.
 * Enterprise resources are not available to the base member role.
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
	traefikFiles: [],
	api: [],
	// Service-level enterprise resources — member can do everything within services they have access to
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
	// Org-level enterprise resources — member cannot manage these
	server: [],
	registry: [],
	certificate: [],
	destination: [],
	notification: [],
	tag: ["read"],
	auditLog: [],
});

/**
 * Viewer role — read-only access to assigned runtime resources.
 * Unlike member, viewer never inherits the legacy boolean write toggles.
 */
export const viewerRole = ac.newRole({
	organization: [],
	member: [],
	invitation: [],
	team: [],
	ac: [],
	project: [],
	service: ["read"],
	environment: ["read"],
	docker: [],
	sshKeys: [],
	gitProviders: [],
	traefikFiles: [],
	api: [],
	volume: ["read"],
	deployment: ["read"],
	envVars: ["read"],
	projectEnvVars: ["read"],
	environmentEnvVars: ["read"],
	backup: ["read"],
	volumeBackup: ["read"],
	schedule: ["read"],
	domain: ["read"],
	logs: ["read"],
	monitoring: ["read"],
	server: [],
	registry: [],
	certificate: [],
	destination: [],
	notification: [],
	tag: ["read"],
	auditLog: [],
});
