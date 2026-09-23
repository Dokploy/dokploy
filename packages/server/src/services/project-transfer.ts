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
	organization,
	postgres,
	projects,
	projectTags,
	redis,
	tags,
} from "@dokploy/server/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

const privilegedOrganizationRoles = new Set(["owner", "admin"]);

export type ProjectTransferBlocker = {
	code:
		| "SOURCE_ACCESS_REQUIRED"
		| "TARGET_ACCESS_REQUIRED"
		| "TARGET_NOT_FOUND"
		| "SAME_ORGANIZATION"
		| "PROJECT_NOT_FOUND"
		| "SERVICES_REQUIRE_MIGRATION";
	message: string;
	resourceCount?: number;
};

export type ProjectTransferPlan = {
	projectId: string;
	projectName: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	environmentCount: number;
	tagNames: string[];
	serviceCount: number;
	blockers: ProjectTransferBlocker[];
	warnings: string[];
	canTransfer: boolean;
};

export class ProjectTransferError extends Error {
	constructor(
		readonly code:
			| "PROJECT_NOT_FOUND"
			| "TARGET_NOT_FOUND"
			| "TRANSFER_BLOCKED",
		message: string,
	) {
		super(message);
		this.name = "ProjectTransferError";
	}
}

type ProjectTransferState = {
	projectId: string;
	projectName: string;
	environmentIds: string[];
	tagNames: string[];
	serviceCount: number;
};

const countTableServices = async <T extends { select: typeof db.select }>(
	database: T,
	environmentIds: string[],
) => {
	if (environmentIds.length === 0) return 0;

	const [
		applicationRows,
		composeRows,
		libsqlRows,
		mariadbRows,
		mongoRows,
		mysqlRows,
		postgresRows,
		redisRows,
	] = await Promise.all([
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(applications)
			.where(inArray(applications.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(compose)
			.where(inArray(compose.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(libsql)
			.where(inArray(libsql.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(mariadb)
			.where(inArray(mariadb.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(mongo)
			.where(inArray(mongo.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(mysql)
			.where(inArray(mysql.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(postgres)
			.where(inArray(postgres.environmentId, environmentIds)),
		database
			.select({ count: sql<number>`count(*)::int` })
			.from(redis)
			.where(inArray(redis.environmentId, environmentIds)),
	]);

	return [
		applicationRows,
		composeRows,
		libsqlRows,
		mariadbRows,
		mongoRows,
		mysqlRows,
		postgresRows,
		redisRows,
	].reduce((total, rows) => total + (rows[0]?.count ?? 0), 0);
};

export const getProjectTransferBlockers = ({
	sourceRole,
	targetRole,
	sourceOrganizationId,
	targetOrganizationId,
	projectFound,
	targetFound,
	serviceCount,
}: {
	sourceRole?: string;
	targetRole?: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	projectFound: boolean;
	targetFound: boolean;
	serviceCount: number;
}): ProjectTransferBlocker[] => {
	const blockers: ProjectTransferBlocker[] = [];

	if (!projectFound) {
		blockers.push({
			code: "PROJECT_NOT_FOUND",
			message: "The project was not found in the active organization.",
		});
	}
	if (!targetFound) {
		blockers.push({
			code: "TARGET_NOT_FOUND",
			message: "The destination organization does not exist.",
		});
	}
	if (sourceOrganizationId === targetOrganizationId) {
		blockers.push({
			code: "SAME_ORGANIZATION",
			message: "The project is already in the selected organization.",
		});
	}
	if (!privilegedOrganizationRoles.has(sourceRole ?? "")) {
		blockers.push({
			code: "SOURCE_ACCESS_REQUIRED",
			message:
				"Only source organization owners and admins can transfer projects.",
		});
	}
	if (!privilegedOrganizationRoles.has(targetRole ?? "")) {
		blockers.push({
			code: "TARGET_ACCESS_REQUIRED",
			message: "You must be an owner or admin of the destination organization.",
		});
	}
	if (serviceCount > 0) {
		blockers.push({
			code: "SERVICES_REQUIRE_MIGRATION",
			message:
				"This project contains services that reference organization-owned infrastructure. Migrate those dependencies before transferring the project.",
			resourceCount: serviceCount,
		});
	}

	return blockers;
};

const loadProjectState = async (
	database: typeof db,
	projectId: string,
	sourceOrganizationId: string,
): Promise<ProjectTransferState | null> => {
	const project = await database.query.projects.findFirst({
		where: and(
			eq(projects.projectId, projectId),
			eq(projects.organizationId, sourceOrganizationId),
		),
		columns: { projectId: true, name: true },
		with: {
			environments: { columns: { environmentId: true } },
			projectTags: {
				with: { tag: { columns: { name: true } } },
			},
		},
	});

	if (!project) return null;

	const environmentIds = project.environments.map(
		(environment) => environment.environmentId,
	);
	return {
		projectId: project.projectId,
		projectName: project.name,
		environmentIds,
		tagNames: project.projectTags.map(({ tag }) => tag.name),
		serviceCount: await countTableServices(database, environmentIds),
	};
};

export const getProjectTransferPlan = async ({
	projectId,
	sourceOrganizationId,
	targetOrganizationId,
	userId,
}: {
	projectId: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	userId: string;
}): Promise<ProjectTransferPlan> => {
	const [targetOrganization, sourceMember, targetMember] = await Promise.all([
		db.query.organization.findFirst({
			where: eq(organization.id, targetOrganizationId),
			columns: { id: true },
		}),
		db.query.member.findFirst({
			where: and(
				eq(member.organizationId, sourceOrganizationId),
				eq(member.userId, userId),
			),
			columns: { role: true },
		}),
		db.query.member.findFirst({
			where: and(
				eq(member.organizationId, targetOrganizationId),
				eq(member.userId, userId),
			),
			columns: { role: true },
		}),
	]);

	// Do not reveal project metadata to a member who cannot transfer projects
	// from the source organization.
	const project = privilegedOrganizationRoles.has(sourceMember?.role ?? "")
		? await loadProjectState(db, projectId, sourceOrganizationId)
		: null;

	const serviceCount = project?.serviceCount ?? 0;
	const blockers = getProjectTransferBlockers({
		sourceRole: sourceMember?.role,
		targetRole: targetMember?.role,
		sourceOrganizationId,
		targetOrganizationId,
		projectFound: !!project,
		targetFound: !!targetOrganization,
		serviceCount,
	});

	return {
		projectId,
		projectName: project?.projectName ?? "",
		sourceOrganizationId,
		targetOrganizationId,
		environmentCount: project?.environmentIds.length ?? 0,
		tagNames: project?.tagNames ?? [],
		serviceCount,
		blockers,
		warnings: [
			"Project environment variables and environments move with the project.",
			"Services are blocked until their organization-owned dependencies support migration.",
		],
		canTransfer: blockers.length === 0,
	};
};

export const transferProject = async ({
	projectId,
	sourceOrganizationId,
	targetOrganizationId,
	userId,
}: {
	projectId: string;
	sourceOrganizationId: string;
	targetOrganizationId: string;
	userId: string;
}) => {
	const plan = await getProjectTransferPlan({
		projectId,
		sourceOrganizationId,
		targetOrganizationId,
		userId,
	});

	if (!plan.canTransfer) {
		throw new ProjectTransferError(
			plan.blockers[0]?.code === "PROJECT_NOT_FOUND"
				? "PROJECT_NOT_FOUND"
				: "TRANSFER_BLOCKED",
			plan.blockers.map((blocker) => blocker.message).join(" "),
		);
	}

	return await db.transaction(async (tx) => {
		if (sourceOrganizationId === targetOrganizationId) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"The project is already in the selected organization.",
			);
		}

		const lockedProject = await tx
			.select({ projectId: projects.projectId, name: projects.name })
			.from(projects)
			.where(
				and(
					eq(projects.projectId, projectId),
					eq(projects.organizationId, sourceOrganizationId),
				),
			)
			.for("update");

		if (!lockedProject[0]) {
			throw new ProjectTransferError(
				"PROJECT_NOT_FOUND",
				"The project changed before the transfer could be completed.",
			);
		}

		const [targetOrganization, sourceMember, targetMember] = await Promise.all([
			tx
				.select({ id: organization.id })
				.from(organization)
				.where(eq(organization.id, targetOrganizationId))
				.limit(1),
			tx
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, sourceOrganizationId),
						eq(member.userId, userId),
					),
				)
				.limit(1),
			tx
				.select({ role: member.role })
				.from(member)
				.where(
					and(
						eq(member.organizationId, targetOrganizationId),
						eq(member.userId, userId),
					),
				)
				.limit(1),
		]);

		if (!targetOrganization[0]) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"The destination organization does not exist.",
			);
		}
		if (!privilegedOrganizationRoles.has(sourceMember[0]?.role ?? "")) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"Only source organization owners and admins can transfer projects.",
			);
		}
		if (!privilegedOrganizationRoles.has(targetMember[0]?.role ?? "")) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"You must be an owner or admin of the destination organization.",
			);
		}

		const environmentRows = await tx
			.select({ environmentId: environments.environmentId })
			.from(environments)
			.where(eq(environments.projectId, projectId));
		const environmentIds = environmentRows.map((row) => row.environmentId);
		const serviceCount = await countTableServices(tx, environmentIds);
		if (serviceCount > 0) {
			throw new ProjectTransferError(
				"TRANSFER_BLOCKED",
				"The project gained services while the transfer was being prepared.",
			);
		}

		const sourceTags = await tx
			.select({ tagId: tags.tagId, name: tags.name, color: tags.color })
			.from(projectTags)
			.innerJoin(tags, eq(projectTags.tagId, tags.tagId))
			.where(eq(projectTags.projectId, projectId));

		await tx.delete(projectTags).where(eq(projectTags.projectId, projectId));

		for (const sourceTag of sourceTags) {
			await tx
				.insert(tags)
				.values({
					tagId: nanoid(),
					name: sourceTag.name,
					color: sourceTag.color,
					organizationId: targetOrganizationId,
				})
				.onConflictDoNothing({
					target: [tags.organizationId, tags.name],
				});

			const targetTag = await tx
				.select({ tagId: tags.tagId })
				.from(tags)
				.where(
					and(
						eq(tags.organizationId, targetOrganizationId),
						eq(tags.name, sourceTag.name),
					),
				)
				.limit(1);

			if (targetTag[0]) {
				await tx
					.insert(projectTags)
					.values({ projectId, tagId: targetTag[0].tagId })
					.onConflictDoNothing();
			}
		}

		await tx
			.update(projects)
			.set({ organizationId: targetOrganizationId })
			.where(
				and(
					eq(projects.projectId, projectId),
					eq(projects.organizationId, sourceOrganizationId),
				),
			);

		if (environmentIds.length > 0) {
			const environmentAccess = environmentIds.reduce<ReturnType<typeof sql>>(
				(expression, environmentId) =>
					sql`array_remove(${expression}, ${environmentId})`,
				sql`${member.accessedEnvironments}`,
			);
			await tx
				.update(member)
				.set({
					accessedProjects: sql`array_remove(${member.accessedProjects}, ${projectId})`,
					accessedEnvironments: environmentAccess,
				})
				.where(eq(member.organizationId, sourceOrganizationId));
		} else {
			await tx
				.update(member)
				.set({
					accessedProjects: sql`array_remove(${member.accessedProjects}, ${projectId})`,
				})
				.where(eq(member.organizationId, sourceOrganizationId));
		}

		return {
			projectId,
			projectName: lockedProject[0].name,
			sourceOrganizationId,
			targetOrganizationId,
		};
	});
};
