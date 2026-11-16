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
	postgres,
	projects,
	redis,
	type ServiceType,
} from "@dokploy/server/db/schema";
import { findOrganizationProjectTree } from "@dokploy/server/services/project";
import {
	SERVICE_ID_FIELD,
	SERVICE_TYPES,
} from "@dokploy/server/services/project-export-import/queries";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";

/** Accepts a transaction so several updates can be applied atomically. */
type Writer = Pick<typeof db, "update">;

export const setServicesAssignedTo = async (
	serviceIds: string[],
	serviceType: ServiceType,
	assignedTo: string,
	executor: Writer = db,
) => {
	if (serviceIds.length === 0) return;
	switch (serviceType) {
		case "application":
			await executor
				.update(applications)
				.set({ assignedTo })
				.where(inArray(applications.applicationId, serviceIds));
			break;
		case "compose":
			await executor
				.update(compose)
				.set({ assignedTo })
				.where(inArray(compose.composeId, serviceIds));
			break;
		case "postgres":
			await executor
				.update(postgres)
				.set({ assignedTo })
				.where(inArray(postgres.postgresId, serviceIds));
			break;
		case "mysql":
			await executor
				.update(mysql)
				.set({ assignedTo })
				.where(inArray(mysql.mysqlId, serviceIds));
			break;
		case "mariadb":
			await executor
				.update(mariadb)
				.set({ assignedTo })
				.where(inArray(mariadb.mariadbId, serviceIds));
			break;
		case "mongo":
			await executor
				.update(mongo)
				.set({ assignedTo })
				.where(inArray(mongo.mongoId, serviceIds));
			break;
		case "redis":
			await executor
				.update(redis)
				.set({ assignedTo })
				.where(inArray(redis.redisId, serviceIds));
			break;
		case "libsql":
			await executor
				.update(libsql)
				.set({ assignedTo })
				.where(inArray(libsql.libsqlId, serviceIds));
			break;
	}
};

const unionArrays = (current: string[], added: string[]) => [
	...new Set([...current, ...added]),
];

/**
 * Assigns the selected resources to `targetUserId`. A target with a restricted
 * role also gets access to them, otherwise they could not see what they were
 * given.
 */
export const reassignResources = async (input: {
	organizationId: string;
	targetUserId: string;
	projectIds: string[];
	environmentIds: string[];
	services: { id: string; type: ServiceType }[];
}) => {
	const target = await db.query.member.findFirst({
		where: and(
			eq(member.userId, input.targetUserId),
			eq(member.organizationId, input.organizationId),
		),
	});
	if (!target) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "The selected user is not a member of this organization",
		});
	}

	const tree = await findOrganizationProjectTree(input.organizationId);
	const projectAssignees = new Map<string, string | null>();
	const environmentParents = new Map<
		string,
		{ projectId: string; assignedTo: string | null }
	>();
	const serviceParents = new Map<
		string,
		{
			type: ServiceType;
			environmentId: string;
			projectId: string;
			assignedTo: string | null;
		}
	>();
	for (const project of tree) {
		projectAssignees.set(project.projectId, project.assignedTo);
		for (const env of project.environments) {
			environmentParents.set(env.environmentId, {
				projectId: project.projectId,
				assignedTo: env.assignedTo,
			});
			for (const type of SERVICE_TYPES) {
				const rows = env[type === "application" ? "applications" : type];
				for (const row of rows as Record<string, unknown>[]) {
					serviceParents.set(row[SERVICE_ID_FIELD[type]] as string, {
						type,
						environmentId: env.environmentId,
						projectId: project.projectId,
						assignedTo: row.assignedTo as string | null,
					});
				}
			}
		}
	}
	const allInOrganization =
		input.projectIds.every((id) => projectAssignees.has(id)) &&
		input.environmentIds.every((id) => environmentParents.has(id)) &&
		input.services.every(
			(service) => serviceParents.get(service.id)?.type === service.type,
		);
	if (!allInOrganization) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Some of the selected items are not in this organization",
		});
	}

	// A selected project takes everything inside it that is assigned to the same
	// user, including items a filter left out of the selection; items assigned
	// to someone else stay with them. Outside selected projects, only what was
	// picked moves.
	const selectedProjects = new Set(input.projectIds);
	const moves = (
		projectId: string,
		assignedTo: string | null,
		picked: boolean,
	) =>
		selectedProjects.has(projectId)
			? assignedTo === projectAssignees.get(projectId)
			: picked;
	const pickedEnvironments = new Set(input.environmentIds);
	const pickedServices = new Set(input.services.map((service) => service.id));
	const environmentIds = [...environmentParents]
		.filter(([id, parent]) =>
			moves(parent.projectId, parent.assignedTo, pickedEnvironments.has(id)),
		)
		.map(([id]) => id);
	const services = [...serviceParents]
		.filter(([id, parent]) =>
			moves(parent.projectId, parent.assignedTo, pickedServices.has(id)),
		)
		.map(([id, parent]) => ({ id, type: parent.type }));

	const serviceIdsByType = new Map<ServiceType, string[]>();
	for (const service of services) {
		serviceIdsByType.set(service.type, [
			...(serviceIdsByType.get(service.type) ?? []),
			service.id,
		]);
	}

	await db.transaction(async (tx) => {
		if (input.projectIds.length > 0) {
			await tx
				.update(projects)
				.set({ assignedTo: input.targetUserId })
				.where(inArray(projects.projectId, input.projectIds));
		}
		if (environmentIds.length > 0) {
			await tx
				.update(environments)
				.set({ assignedTo: input.targetUserId })
				.where(inArray(environments.environmentId, environmentIds));
		}
		for (const [type, ids] of serviceIdsByType) {
			await setServicesAssignedTo(ids, type, input.targetUserId, tx);
		}

		if (target.role === "owner" || target.role === "admin") return;
		// Read under a row lock so concurrent reassignments to the same member
		// can't overwrite each other's grants.
		const [current] = await tx
			.select({
				accessedProjects: member.accessedProjects,
				accessedEnvironments: member.accessedEnvironments,
				accessedServices: member.accessedServices,
			})
			.from(member)
			.where(eq(member.id, target.id))
			.for("update");
		if (!current) return;
		const serviceParentsOf = services.map(
			(service) => serviceParents.get(service.id)!,
		);
		await tx
			.update(member)
			.set({
				accessedProjects: unionArrays(current.accessedProjects, [
					...input.projectIds,
					...environmentIds.map((id) => environmentParents.get(id)!.projectId),
					...serviceParentsOf.map((parent) => parent.projectId),
				]),
				accessedEnvironments: unionArrays(current.accessedEnvironments, [
					...environmentIds,
					...serviceParentsOf.map((parent) => parent.environmentId),
				]),
				accessedServices: unionArrays(
					current.accessedServices,
					services.map((service) => service.id),
				),
			})
			.where(eq(member.id, target.id));
	});

	return {
		projects: input.projectIds.length,
		environments: environmentIds.length,
		services: services.length,
	};
};
