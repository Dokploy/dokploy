import { eq } from "drizzle-orm";
import { db } from "../db";
import {
	type createRoleSchema,
	role,
	type updateRoleSchema,
} from "../db/schema";
import type { z } from "zod";

export const createRole = async (
	input: z.infer<typeof createRoleSchema>,
	organizationId: string,
) => {
	await db.transaction(async (tx) => {
		const { ...other } = input;
		const newRole = await tx
			.insert(role)
			.values({ ...other, organizationId })
			.returning()
			.then((res) => res[0]);

		if (!newRole) {
			throw new Error("Failed to create role");
		}

		return role;
	});
};

const findRoleById = async (roleId: string) => {
	const result = await db.query.role.findFirst({
		where: eq(role.roleId, roleId),
	});

	if (!result) {
		throw new Error("Role not found");
	}

	return result;
};

export const removeRoleById = async (roleId: string) => {
	const currentRole = await findRoleById(roleId);

	if (!currentRole) {
		throw new Error("Role not found");
	}

	if (currentRole.isSystem) {
		throw new Error("Cannot delete system role");
	}

	await db.delete(role).where(eq(role.roleId, roleId));

	return currentRole;
};

export const updateRoleById = async (
	roleId: string,
	input: z.infer<typeof updateRoleSchema>,
) => {
	const currentRole = await findRoleById(roleId);

	if (!currentRole) {
		throw new Error("Role not found");
	}

	await db.update(role).set(input).where(eq(role.roleId, roleId));

	return currentRole;
};
