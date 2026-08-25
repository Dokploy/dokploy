import { db } from "@dokploy/server/db";
import {
	type apiAssignComposeServiceProfile,
	type apiCreateResourceGroup,
	type apiCreateResourceProfile,
	applications,
	composeServiceResourceProfile,
	type apiUpdateResourceGroup,
	type apiUpdateResourceProfile,
	libsql,
	mariadb,
	mongo,
	mysql,
	postgres,
	redis,
	resourceGroup,
	resourceProfile,
} from "@dokploy/server/db/schema";
import type { ResourceRequirements } from "dockerode";
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import type { ComposeSpecification } from "../utils/docker/types";
import { calculateResources } from "../utils/docker/utils";

export type ResourceGroup = typeof resourceGroup.$inferSelect;
export type ResourceProfile = typeof resourceProfile.$inferSelect;

type ResourceValues = {
	memoryReservation: string | null;
	memoryLimit: string | null;
	cpuReservation: string | null;
	cpuLimit: string | null;
};

export const createResourceGroup = async (
	input: z.infer<typeof apiCreateResourceGroup>,
	organizationId: string,
) => {
	const newGroup = await db
		.insert(resourceGroup)
		.values({
			name: input.name,
			description: input.description,
			organizationId,
		})
		.returning()
		.then((value) => value[0]);

	if (!newGroup) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting resource group",
		});
	}

	return newGroup;
};

export const updateResourceGroupById = async (
	input: z.infer<typeof apiUpdateResourceGroup>,
) => {
	const result = await db
		.update(resourceGroup)
		.set({
			name: input.name,
			description: input.description,
		})
		.where(eq(resourceGroup.groupId, input.groupId))
		.returning();

	return result[0];
};

export const removeResourceGroupById = async (
	groupId: string,
	organizationId: string,
) => {
	const group = await db.query.resourceGroup.findFirst({
		where: and(
			eq(resourceGroup.groupId, groupId),
			eq(resourceGroup.organizationId, organizationId),
		),
		with: {
			profiles: true,
		},
	});

	if (!group) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Resource group not found",
		});
	}

	if (group.profiles.length > 0) {
		const usage = await getProfilesUsageCounts(
			group.profiles.map((p) => p.profileId),
		);
		const totalUsage = [...usage.values()].reduce((a, b) => a + b, 0);
		if (totalUsage > 0) {
			throw new TRPCError({
				code: "CONFLICT",
				message:
					"Cannot delete this group because one or more profiles are still assigned to services. Unassign them first.",
			});
		}
	}

	const result = await db
		.delete(resourceGroup)
		.where(
			and(
				eq(resourceGroup.groupId, groupId),
				eq(resourceGroup.organizationId, organizationId),
			),
		)
		.returning();

	return result[0];
};

export const createResourceProfile = async (
	input: z.infer<typeof apiCreateResourceProfile>,
) => {
	const newProfile = await db
		.insert(resourceProfile)
		.values({
			name: input.name,
			groupId: input.groupId,
			memoryReservation: input.memoryReservation ?? null,
			memoryLimit: input.memoryLimit ?? null,
			cpuReservation: input.cpuReservation ?? null,
			cpuLimit: input.cpuLimit ?? null,
		})
		.returning()
		.then((value) => value[0]);

	if (!newProfile) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error input: Inserting resource profile",
		});
	}

	return newProfile;
};

export const updateResourceProfileById = async (
	input: z.infer<typeof apiUpdateResourceProfile>,
) => {
	const result = await db
		.update(resourceProfile)
		.set({
			...(input.name !== undefined && { name: input.name }),
			...(input.memoryReservation !== undefined && {
				memoryReservation: input.memoryReservation,
			}),
			...(input.memoryLimit !== undefined && {
				memoryLimit: input.memoryLimit,
			}),
			...(input.cpuReservation !== undefined && {
				cpuReservation: input.cpuReservation,
			}),
			...(input.cpuLimit !== undefined && { cpuLimit: input.cpuLimit }),
		})
		.where(eq(resourceProfile.profileId, input.profileId))
		.returning();

	return result[0];
};

export const findResourceProfileById = async (profileId: string) => {
	const profile = await db.query.resourceProfile.findFirst({
		where: eq(resourceProfile.profileId, profileId),
	});
	return profile;
};

export const removeResourceProfileById = async (
	profileId: string,
	organizationId: string,
) => {
	const profile = await db.query.resourceProfile.findFirst({
		where: eq(resourceProfile.profileId, profileId),
		with: {
			group: true,
		},
	});

	if (!profile || profile.group.organizationId !== organizationId) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Resource profile not found",
		});
	}

	const usage = await getProfilesUsageCounts([profileId]);
	if ((usage.get(profileId) || 0) > 0) {
		throw new TRPCError({
			code: "CONFLICT",
			message:
				"Cannot delete this profile because it is still assigned to services. Unassign it first.",
		});
	}

	const result = await db
		.delete(resourceProfile)
		.where(eq(resourceProfile.profileId, profileId))
		.returning();

	return result[0];
};

export const findResourceGroupsByOrganization = (organizationId: string) => {
	return db.query.resourceGroup.findMany({
		where: eq(resourceGroup.organizationId, organizationId),
		with: {
			profiles: {
				orderBy: [asc(resourceProfile.name)],
			},
		},
		orderBy: [asc(resourceGroup.name)],
	});
};

export const getProfilesUsageCounts = async (profileIds: string[]) => {
	const counts = new Map<string, number>();
	if (profileIds.length === 0) {
		return counts;
	}

	const increment = (rows: Array<{ resourceProfileId: string | null }>) => {
		for (const row of rows) {
			if (row.resourceProfileId) {
				counts.set(
					row.resourceProfileId,
					(counts.get(row.resourceProfileId) || 0) + 1,
				);
			}
		}
	};

	increment(
		await db
			.select({ resourceProfileId: applications.resourceProfileId })
			.from(applications)
			.where(inArray(applications.resourceProfileId, profileIds)),
	);
	increment(
		await db
			.select({ resourceProfileId: postgres.resourceProfileId })
			.from(postgres)
			.where(inArray(postgres.resourceProfileId, profileIds)),
	);
	increment(
		await db
			.select({ resourceProfileId: mysql.resourceProfileId })
			.from(mysql)
			.where(inArray(mysql.resourceProfileId, profileIds)),
	);
	increment(
		await db
			.select({ resourceProfileId: mariadb.resourceProfileId })
			.from(mariadb)
			.where(inArray(mariadb.resourceProfileId, profileIds)),
	);
	increment(
		await db
			.select({ resourceProfileId: mongo.resourceProfileId })
			.from(mongo)
			.where(inArray(mongo.resourceProfileId, profileIds)),
	);
	increment(
		await db
			.select({ resourceProfileId: redis.resourceProfileId })
			.from(redis)
			.where(inArray(redis.resourceProfileId, profileIds)),
	);
	increment(
		await db
			.select({ resourceProfileId: libsql.resourceProfileId })
			.from(libsql)
			.where(inArray(libsql.resourceProfileId, profileIds)),
	);

	const composeAssignments = await db
		.select({ resourceProfileId: composeServiceResourceProfile.profileId })
		.from(composeServiceResourceProfile)
		.where(inArray(composeServiceResourceProfile.profileId, profileIds));
	increment(composeAssignments);

	return counts;
};

/**
 * Resolves the effective resources of a service: explicit values on the
 * service act as overrides of the values inherited from its resource profile.
 */
export const resolveEffectiveResources = async (
	service: Partial<ResourceValues> & { resourceProfileId?: string | null },
): Promise<ResourceRequirements> => {
	let { memoryLimit, memoryReservation, cpuLimit, cpuReservation } = service;

	if (service.resourceProfileId) {
		const profile = await findResourceProfileById(service.resourceProfileId);
		if (profile) {
			memoryLimit ??= profile.memoryLimit;
			memoryReservation ??= profile.memoryReservation;
			cpuLimit ??= profile.cpuLimit;
			cpuReservation ??= profile.cpuReservation;
		}
	}

	return calculateResources({
		memoryLimit: memoryLimit ?? null,
		memoryReservation: memoryReservation ?? null,
		cpuLimit: cpuLimit ?? null,
		cpuReservation: cpuReservation ?? null,
	});
};

export const findComposeServiceAssignments = (composeId: string) => {
	return db
		.select()
		.from(composeServiceResourceProfile)
		.where(eq(composeServiceResourceProfile.composeId, composeId));
};

export const saveComposeServiceAssignment = async (
	input: z.infer<typeof apiAssignComposeServiceProfile>,
) => {
	const result = await db
		.insert(composeServiceResourceProfile)
		.values({
			composeId: input.composeId,
			serviceName: input.serviceName,
			profileId: input.profileId ?? null,
			memoryReservation: input.memoryReservation ?? null,
			memoryLimit: input.memoryLimit ?? null,
			cpuReservation: input.cpuReservation ?? null,
			cpuLimit: input.cpuLimit ?? null,
		})
		.onConflictDoUpdate({
			target: [
				composeServiceResourceProfile.composeId,
				composeServiceResourceProfile.serviceName,
			],
			set: {
				profileId: input.profileId ?? null,
				memoryReservation: input.memoryReservation ?? null,
				memoryLimit: input.memoryLimit ?? null,
				cpuReservation: input.cpuReservation ?? null,
				cpuLimit: input.cpuLimit ?? null,
			},
		})
		.returning();

	return result[0];
};

export const removeComposeServiceAssignment = async (
	composeServiceId: string,
) => {
	const result = await db
		.delete(composeServiceResourceProfile)
		.where(eq(composeServiceResourceProfile.composeServiceId, composeServiceId))
		.returning();

	return result[0];
};

/**
 * Injects `deploy.resources.limits/reservations` into the compose services
 * that have a resource profile assignment. Dokploy assignments win over any
 * `deploy.resources` already defined in the compose file for that service.
 */
export const applyResourceProfilesToSpecification = async (
	composeId: string,
	spec: ComposeSpecification,
): Promise<ComposeSpecification> => {
	const assignments = await findComposeServiceAssignments(composeId);
	if (!assignments.length || !spec.services) {
		return spec;
	}

	const profileIds = assignments
		.map((a) => a.profileId)
		.filter((id): id is string => !!id);
	const profiles = new Map<string, ResourceProfile>();
	if (profileIds.length > 0) {
		const rows = await db
			.select()
			.from(resourceProfile)
			.where(inArray(resourceProfile.profileId, profileIds));
		for (const row of rows) {
			profiles.set(row.profileId, row);
		}
	}

	for (const assignment of assignments) {
		const service = spec.services[assignment.serviceName];
		if (!service) {
			continue;
		}
		const profile = assignment.profileId
			? profiles.get(assignment.profileId)
			: undefined;

		const memoryLimit = assignment.memoryLimit ?? profile?.memoryLimit ?? null;
		const memoryReservation =
			assignment.memoryReservation ?? profile?.memoryReservation ?? null;
		const cpuLimit = assignment.cpuLimit ?? profile?.cpuLimit ?? null;
		const cpuReservation =
			assignment.cpuReservation ?? profile?.cpuReservation ?? null;

		const existingLimits = service.deploy?.resources?.limits ?? {};
		const existingReservations = service.deploy?.resources?.reservations ?? {};

		const limits = {
			...existingLimits,
			...(memoryLimit && { memory: String(memoryLimit) }),
			...(cpuLimit && { cpus: String(Number(cpuLimit) / 1_000_000_000) }),
		};
		const reservations = {
			...existingReservations,
			...(memoryReservation && { memory: String(memoryReservation) }),
			...(cpuReservation && {
				cpus: String(Number(cpuReservation) / 1_000_000_000),
			}),
		};

		service.deploy = {
			...service.deploy,
			resources: {
				...(Object.keys(limits).length > 0 && { limits }),
				...(Object.keys(reservations).length > 0 && { reservations }),
			},
		};
	}

	return spec;
};
