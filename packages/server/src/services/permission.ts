import { db } from "@dokploy/server/db";
import {
	applications,
	compose,
	environments,
	libsql,
	mariadb,
	member,
	mongo,
	mysql,
	organizationRole,
	postgres,
	projects,
	redis,
} from "@dokploy/server/db/schema";
import { hasValidLicense } from "@dokploy/server/services/proprietary/license-key";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import {
	ac,
	adminRole,
	enterpriseOnlyResources,
	memberRole,
	ownerRole,
	statements,
} from "../lib/access-control";

type Statements = typeof statements;
type Resource = keyof Statements;
type Action<R extends Resource> = Statements[R][number];
type Permissions = {
	[R in Resource]?: Action<R>[];
};

export type PermissionCtx = {
	user: { id: string };
	session: { activeOrganizationId: string };
};

export type ResolvedPermissions = {
	[R in Resource]: {
		[A in Statements[R][number]]: boolean;
	};
};

const staticRoles: Record<string, ReturnType<typeof ac.newRole>> = {
	owner: ownerRole,
	admin: adminRole,
	member: memberRole,
};

const resolveRole = async (
	roleName: string,
	organizationId: string,
): Promise<ReturnType<typeof ac.newRole> | null> => {
	if (staticRoles[roleName]) {
		return staticRoles[roleName];
	}

	const licensed = await hasValidLicense(organizationId);
	if (!licensed) {
		return null;
	}

	const customRoles = await db.query.organizationRole.findMany({
		where: and(
			eq(organizationRole.organizationId, organizationId),
			eq(organizationRole.role, roleName),
		),
	});

	if (customRoles.length === 0) {
		return null;
	}

	const merged: Record<string, string[]> = {};
	for (const entry of customRoles) {
		const parsed = JSON.parse(entry.permission) as Record<string, string[]>;
		for (const [resource, actions] of Object.entries(parsed)) {
			merged[resource] = [
				...new Set([...(merged[resource] ?? []), ...actions]),
			];
		}
	}

	return ac.newRole(merged as any);
};

export const checkPermission = async (
	ctx: PermissionCtx,
	permissions: Permissions,
) => {
	const { id: userId } = ctx.user;
	const { activeOrganizationId: organizationId } = ctx.session;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	const isPrivilegedStaticRole =
		memberRecord.role === "owner" || memberRecord.role === "admin";
	if (isPrivilegedStaticRole) {
		const allEnterprise = Object.keys(permissions).every((r) =>
			enterpriseOnlyResources.has(r),
		);
		if (allEnterprise) return;
	}

	const role = await resolveRole(memberRecord.role, organizationId);

	if (!role) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Invalid role",
		});
	}

	const result = role.authorize(permissions);
	if (result.success) {
		return;
	}

	if (memberRecord.role === "member") {
		const overrides = getLegacyOverrides(memberRecord);
		const allGranted = Object.entries(permissions).every(
			([resource, actions]) =>
				(actions as string[]).every(
					(action) =>
						!!(overrides[resource] as Record<string, boolean> | undefined)?.[
							action
						],
				),
		);
		if (allGranted) {
			return;
		}
	}

	throw new TRPCError({
		code: "UNAUTHORIZED",
		message: result.error || "Permission denied",
	});
};

export const hasPermission = async (
	ctx: PermissionCtx,
	permissions: Permissions,
): Promise<boolean> => {
	try {
		await checkPermission(ctx, permissions);
		return true;
	} catch {
		return false;
	}
};

const getLegacyOverrides = (
	memberRecord: Awaited<ReturnType<typeof findMemberByUserId>>,
): Partial<Record<string, Record<string, boolean>>> => {
	return {
		project: {
			create: !!memberRecord.canCreateProjects,
			delete: !!memberRecord.canDeleteProjects,
		},
		service: {
			create: !!memberRecord.canCreateServices,
			delete: !!memberRecord.canDeleteServices,
		},
		environment: {
			create: !!memberRecord.canCreateEnvironments,
			delete: !!memberRecord.canDeleteEnvironments,
		},
		traefikFiles: {
			read: !!memberRecord.canAccessToTraefikFiles,
		},
		docker: {
			read: !!memberRecord.canAccessToDocker,
		},
		api: {
			read: !!memberRecord.canAccessToAPI,
		},
		sshKeys: {
			read: !!memberRecord.canAccessToSSHKeys,
			create: !!memberRecord.canAccessToSSHKeys,
			delete: !!memberRecord.canAccessToSSHKeys,
		},
		gitProviders: {
			read: !!memberRecord.canAccessToGitProviders,
			create: !!memberRecord.canAccessToGitProviders,
			delete: !!memberRecord.canAccessToGitProviders,
		},
	};
};

export const resolvePermissions = async (
	ctx: PermissionCtx,
): Promise<ResolvedPermissions> => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	const role = await resolveRole(memberRecord.role, organizationId);

	const legacyOverrides =
		memberRecord.role === "member" ? getLegacyOverrides(memberRecord) : {};

	const isPrivilegedRole =
		memberRecord.role === "owner" || memberRecord.role === "admin";
	const result = {} as ResolvedPermissions;

	for (const [resource, actions] of Object.entries(statements)) {
		const resourcePerms = {} as Record<string, boolean>;
		for (const action of actions) {
			if (isPrivilegedRole && enterpriseOnlyResources.has(resource)) {
				resourcePerms[action] = true;
				continue;
			}
			if (!role) {
				resourcePerms[action] = false;
				continue;
			}
			const check = role.authorize({ [resource]: [action] });
			resourcePerms[action] =
				check.success ||
				!!(legacyOverrides[resource] as Record<string, boolean> | undefined)?.[
					action
				];
		}
		(result as any)[resource] = resourcePerms;
	}

	return result;
};

const serviceTables = [
	[applications, applications.applicationId],
	[compose, compose.composeId],
	[postgres, postgres.postgresId],
	[mysql, mysql.mysqlId],
	[mariadb, mariadb.mariadbId],
	[mongo, mongo.mongoId],
	[redis, redis.redisId],
	[libsql, libsql.libsqlId],
] as const;

// Callers pass the id of any service type, so the owning table is unknown.
const findServiceOrganizationId = async (serviceId: string) => {
	for (const [table, idColumn] of serviceTables) {
		const [row] = await db
			.select({ organizationId: projects.organizationId })
			.from(table)
			.innerJoin(
				environments,
				eq(table.environmentId, environments.environmentId),
			)
			.innerJoin(projects, eq(environments.projectId, projects.projectId))
			.where(eq(idColumn, serviceId));
		if (row) {
			return row.organizationId;
		}
	}
	return undefined;
};

const findProjectOrganizationId = async (projectId: string) => {
	const project = await db.query.projects.findFirst({
		where: eq(projects.projectId, projectId),
		columns: { organizationId: true },
	});
	return project?.organizationId;
};

const findEnvironmentOrganizationId = async (environmentId: string) => {
	const [row] = await db
		.select({ organizationId: projects.organizationId })
		.from(environments)
		.innerJoin(projects, eq(environments.projectId, projects.projectId))
		.where(eq(environments.environmentId, environmentId));
	return row?.organizationId;
};

const notFoundMessages = {
	service: "Service not found",
	project: "Project not found",
	environment: "Environment not found",
};

const assertOrganizationOwns = (
	ctx: PermissionCtx,
	resource: keyof typeof notFoundMessages,
	ownerOrganizationId: string | undefined,
) => {
	if (!ownerOrganizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: notFoundMessages[resource],
		});
	}
	if (ownerOrganizationId !== ctx.session.activeOrganizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: `You are not authorized to access this ${resource}`,
		});
	}
};

const assertServiceInOrganization = async (
	ctx: PermissionCtx,
	serviceId: string,
) =>
	assertOrganizationOwns(
		ctx,
		"service",
		await findServiceOrganizationId(serviceId),
	);

const assertProjectInOrganization = async (
	ctx: PermissionCtx,
	projectId: string,
) =>
	assertOrganizationOwns(
		ctx,
		"project",
		await findProjectOrganizationId(projectId),
	);

export const checkProjectAccess = async (
	ctx: PermissionCtx,
	action: "create" | "delete",
	projectId?: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { project: [action] });

	if (
		action !== "create" &&
		projectId &&
		memberRecord.role !== "owner" &&
		memberRecord.role !== "admin"
	) {
		if (!memberRecord.accessedProjects.includes(projectId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this project",
			});
		}
	}
};

export const checkServicePermissionAndAccess = async (
	ctx: PermissionCtx,
	serviceId: string,
	permissions: Permissions,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await assertServiceInOrganization(ctx, serviceId);
	await checkPermission(ctx, permissions);
	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (!memberRecord.accessedServices.includes(serviceId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this service",
			});
		}
	}
};

export const checkServiceAccess = async (
	ctx: PermissionCtx,
	serviceId: string,
	action: "create" | "read" | "delete" = "read",
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	// For "create" the id is the target project, not an existing service.
	if (action === "create") {
		await assertProjectInOrganization(ctx, serviceId);
	} else {
		await assertServiceInOrganization(ctx, serviceId);
	}

	await checkPermission(ctx, { service: [action] });

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (action === "create") {
			if (!memberRecord.accessedProjects.includes(serviceId)) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this project",
				});
			}
		} else {
			if (!memberRecord.accessedServices.includes(serviceId)) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You don't have access to this service",
				});
			}
		}
	}
};

export const checkEnvironmentAccess = async (
	ctx: PermissionCtx,
	environmentId: string,
	action: "read" | "create" | "delete" = "read",
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	assertOrganizationOwns(
		ctx,
		"environment",
		await findEnvironmentOrganizationId(environmentId),
	);
	await checkPermission(ctx, { environment: [action] });

	if (
		action !== "create" &&
		memberRecord.role !== "owner" &&
		memberRecord.role !== "admin"
	) {
		if (!memberRecord.accessedEnvironments.includes(environmentId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this environment",
			});
		}
	}
};

export const checkEnvironmentCreationPermission = async (
	ctx: PermissionCtx,
	projectId: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await assertProjectInOrganization(ctx, projectId);

	await checkPermission(ctx, { environment: ["create"] });

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (!memberRecord.accessedProjects.includes(projectId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this project",
			});
		}
	}
};

export const checkEnvironmentDeletionPermission = async (
	ctx: PermissionCtx,
	projectId: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);

	await checkPermission(ctx, { environment: ["delete"] });

	if (memberRecord.role !== "owner" && memberRecord.role !== "admin") {
		if (!memberRecord.accessedProjects.includes(projectId)) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "You don't have access to this project",
			});
		}
	}
};

export const addNewProject = async (ctx: PermissionCtx, projectId: string) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedProjects: [...memberRecord.accessedProjects, projectId],
		})
		.where(
			and(
				eq(member.id, memberRecord.id),
				eq(member.organizationId, organizationId),
			),
		);
};

export const addNewEnvironment = async (
	ctx: PermissionCtx,
	environmentId: string,
) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedEnvironments: [
				...memberRecord.accessedEnvironments,
				environmentId,
			],
		})
		.where(
			and(
				eq(member.id, memberRecord.id),
				eq(member.organizationId, organizationId),
			),
		);
};

export const addNewService = async (ctx: PermissionCtx, serviceId: string) => {
	const userId = ctx.user.id;
	const organizationId = ctx.session.activeOrganizationId;
	const memberRecord = await findMemberByUserId(userId, organizationId);
	await db
		.update(member)
		.set({
			accessedServices: [...memberRecord.accessedServices, serviceId],
		})
		.where(
			and(
				eq(member.id, memberRecord.id),
				eq(member.organizationId, organizationId),
			),
		);
};

export type DomainRestriction = { patterns: string[]; requireHttps: boolean };

export const DOMAIN_PATTERN_REGEX = /^\*\.([a-z0-9-]+\.)+[a-z0-9-]+$/;

export const getDomainRestriction = async (
	ctx: PermissionCtx,
): Promise<DomainRestriction | null> => {
	const { activeOrganizationId: organizationId } = ctx.session;
	const memberRecord = await findMemberByUserId(ctx.user.id, organizationId);
	if (Object.hasOwn(staticRoles, memberRecord.role)) return null;

	const rows = await db.query.organizationRole.findMany({
		where: and(
			eq(organizationRole.organizationId, organizationId),
			eq(organizationRole.role, memberRecord.role),
		),
		columns: { allowedDomains: true, requireHttps: true },
	});
	const patterns = [...new Set(rows.flatMap((r) => r.allowedDomains ?? []))];
	if (patterns.length === 0) return null;
	return { patterns, requireHttps: rows.some((r) => r.requireHttps) };
};

// Same semantics as a TLS wildcard: exactly one label in front of the suffix.
export const matchesDomainPattern = (host: string, pattern: string) => {
	const h = host.trim().toLowerCase();
	const suffix = pattern.slice(1);
	if (!h.endsWith(suffix)) return false;
	return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(h.slice(0, -suffix.length));
};

type DomainInput = {
	host: string;
	https?: boolean | null;
	path?: string | null;
};

// Paths are interpolated into the Traefik rule unescaped.
const isSafeRulePath = (path?: string | null) =>
	!path || /^(\/[^`\s$]*)?$/.test(path);

const domainViolation = (
	restriction: DomainRestriction,
	domain: DomainInput,
) => {
	if (!restriction.patterns.some((p) => matchesDomainPattern(domain.host, p))) {
		return `Your role can only use domains matching: ${restriction.patterns.join(", ")}`;
	}
	if (restriction.requireHttps && !domain.https) {
		return "Your role requires HTTPS on domains";
	}
	if (!isSafeRulePath(domain.path)) {
		return "Domain path cannot contain spaces, backticks or '$'";
	}
	return null;
};

export const previewViolation = (
	restriction: DomainRestriction,
	preview: {
		active: boolean | null;
		wildcard: string | null;
		https: boolean;
		path: string | null;
	},
) => {
	if (!preview.active) return null;
	const wildcard = (preview.wildcard || "*.sslip.io").toLowerCase();
	if (!restriction.patterns.includes(wildcard)) {
		return `Your role can only use preview wildcards: ${restriction.patterns.join(", ")}`;
	}
	if (restriction.requireHttps && !preview.https) {
		return "Your role requires HTTPS on domains";
	}
	if (!isSafeRulePath(preview.path)) {
		return "Preview path cannot contain spaces, backticks or '$'";
	}
	return null;
};

export const isDomainAllowed = (
	restriction: DomainRestriction | null,
	domain: DomainInput,
) => !restriction || domainViolation(restriction, domain) === null;

// Template domains have no HTTPS setting; roles that require it get Let's Encrypt.
export const templateDomainInput = <T extends { host?: string }>(
	domain: T,
	restriction: DomainRestriction | null,
) => {
	const https = !!restriction?.requireHttps;
	return {
		...domain,
		host: domain.host || "",
		https,
		certificateType: https ? ("letsencrypt" as const) : ("none" as const),
	};
};

export const assertDomainAllowed = (
	restriction: DomainRestriction | null,
	domain: DomainInput,
) => {
	if (!restriction) return;
	const message = domainViolation(restriction, domain);
	if (message) throw new TRPCError({ code: "FORBIDDEN", message });
};

const isTraefikLabel = (key: string) =>
	key.trim().toLowerCase().startsWith("traefik.");

// The swarm provider is enabled and services share dokploy-network, so a
// Host() label would publish any host without going through domains.
// Existing traefik labels (set by an admin) may be kept or removed, not changed.
export const assertNoTraefikLabels = async (
	ctx: PermissionCtx,
	labels: Record<string, string> | null | undefined,
	loadCurrent: () => Promise<{ labelsSwarm: Record<string, string> | null }>,
) => {
	const traefikKeys = Object.keys(labels ?? {}).filter(isTraefikLabel);
	if (traefikKeys.length === 0) return;
	if (!(await getDomainRestriction(ctx))) return;
	const current = (await loadCurrent()).labelsSwarm ?? {};
	if (traefikKeys.some((key) => current[key] !== labels?.[key])) {
		throw new TRPCError({
			code: "FORBIDDEN",
			message: "Your role cannot set Traefik labels",
		});
	}
};

export const stripTraefikLabels = <T extends Record<string, string> | null>(
	labels: T,
): T =>
	labels &&
	(Object.fromEntries(
		Object.entries(labels).filter(([key]) => !isTraefikLabel(key)),
	) as T);

export const findMemberByUserId = async (
	userId: string,
	organizationId: string,
) => {
	const result = await db.query.member.findFirst({
		where: and(
			eq(member.userId, userId),
			eq(member.organizationId, organizationId),
		),
		with: {
			user: true,
		},
	});

	if (!result) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Permission denied",
		});
	}
	return result;
};
