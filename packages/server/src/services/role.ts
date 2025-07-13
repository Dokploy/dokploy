// import { eq } from "drizzle-orm";
// import { db } from "../db";
// import {
// 	type createRoleSchema,
// 	member,
// 	role,
// 	type updateRoleSchema,
// } from "../db/schema";
// import type { z } from "zod";
// import {
// 	adminPermissions,
// 	memberPermissions,
// 	ownerPermissions,
// } from "../lib/permissions";

// export const createRole = async (
// 	input: z.infer<typeof createRoleSchema>,
// 	organizationId: string,
// ) => {
// 	await db.transaction(async (tx) => {
// 		const { ...other } = input;
// 		const newRole = await tx
// 			.insert(role)
// 			.values({ ...other, organizationId })
// 			.returning()
// 			.then((res) => res[0]);

// 		if (!newRole) {
// 			throw new Error("Failed to create role");
// 		}

// 		return role;
// 	});
// };

// const findRoleById = async (roleId: string) => {
// 	const result = await db.query.role.findFirst({
// 		where: eq(role.roleId, roleId),
// 	});

// 	if (!result) {
// 		throw new Error("Role not found");
// 	}

// 	return result;
// };

// export const removeRoleById = async (roleId: string) => {
// 	const currentRole = await findRoleById(roleId);

// 	if (!currentRole) {
// 		throw new Error("Role not found");
// 	}

// 	if (currentRole.isSystem) {
// 		throw new Error("Cannot delete system role");
// 	}

// 	const members = await db.query.member.findMany({
// 		where: eq(member.roleId, roleId),
// 	});

// 	if (members.length > 0) {
// 		throw new Error("Cannot delete role with assigned members");
// 	}

// 	await db.delete(role).where(eq(role.roleId, roleId));

// 	return currentRole;
// };

// export const updateRoleById = async (
// 	roleId: string,
// 	input: z.infer<typeof updateRoleSchema>,
// ) => {
// 	const currentRole = await findRoleById(roleId);

// 	if (!currentRole) {
// 		throw new Error("Role not found");
// 	}

// 	if (currentRole.isSystem) {
// 		throw new Error("Cannot update system role");
// 	}

// 	await db.update(role).set(input).where(eq(role.roleId, roleId));

// 	return currentRole;
// };

// export const createDefaultRoles = async (organizationId: string) => {
// 	await db.transaction(async (tx) => {
// 		await tx.insert(role).values({
// 			name: "owner",
// 			description: "Owner of the organization with full access to all features",
// 			organizationId,
// 			isSystem: true,
// 			permissions: ownerPermissions.map((permission) => permission.name),
// 		});

// 		await tx.insert(role).values({
// 			name: "admin",
// 			description:
// 				"Administrator with access to manage projects, services and configurations",
// 			organizationId,
// 			isSystem: true,
// 			permissions: adminPermissions.map((permission) => permission.name),
// 		});

// 		await tx.insert(role).values({
// 			name: "member",
// 			description:
// 				"Regular member with access to create projects and manage services",
// 			organizationId,
// 			isSystem: true,
// 			permissions: memberPermissions.map((permission) => permission.name),
// 		});
// 	});
// };
