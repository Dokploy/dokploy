import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import * as bcrypt from "bcrypt";
import { isAfter } from "date-fns";
import { eq } from "drizzle-orm";
import { db } from "~/server/db";
import {
	admins,
	type apiCreateUserInvitation,
	auth,
	users,
} from "~/server/db/schema";

export type Admin = typeof admins.$inferSelect;

export const createInvitation = async (
	input: typeof apiCreateUserInvitation._type,
) => {
	await db.transaction(async (tx) => {
		const admin = await findAdmin();

		const result = await tx
			.insert(auth)
			.values({
				email: input.email,
				rol: "user",
				password: bcrypt.hashSync("01231203012312", 10),
			})
			.returning()
			.then((res) => res[0]);

		if (!result) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error to create the user",
			});
		}
		const expiresIn24Hours = new Date();
		expiresIn24Hours.setDate(expiresIn24Hours.getDate() + 1);
		const token = randomBytes(32).toString("hex");
		await tx
			.insert(users)
			.values({
				adminId: admin.adminId,
				authId: result.id,
				token,
				expirationDate: expiresIn24Hours.toISOString(),
			})
			.returning();
	});
};

export const findAdminById = async (adminId: string) => {
	const admin = await db.query.admins.findFirst({
		where: eq(admins.adminId, adminId),
	});
	if (!admin) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Admin not found",
		});
	}
	return admin;
};

export const updateAdmin = async (
	authId: string,
	adminData: Partial<Admin>,
) => {
	const admin = await db
		.update(admins)
		.set({
			...adminData,
		})
		.where(eq(admins.authId, authId))
		.returning()
		.then((res) => res[0]);

	return admin;
};

export const isAdminPresent = async () => {
	const admin = await db.query.admins.findFirst();
	if (!admin) {
		return false;
	}
	return true;
};

export const findAdminByAuthId = async (authId: string) => {
	const admin = await db.query.admins.findFirst({
		where: eq(admins.authId, authId),
	});
	if (!admin) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Admin not found",
		});
	}
	return admin;
};

export const findAdmin = async () => {
	const admin = await db.query.admins.findFirst({});
	if (!admin) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Admin not found",
		});
	}
	return admin;
};

export const getUserByToken = async (token: string) => {
	const user = await db.query.users.findFirst({
		where: eq(users.token, token),
		with: {
			auth: {
				columns: {
					password: false,
				},
			},
		},
	});

	if (!user) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Invitation not found",
		});
	}

	const now = new Date();
	const isExpired = isAfter(now, new Date(user.expirationDate));

	return {
		...user,
		isExpired,
	};
};

export const removeUserByAuthId = async (authId: string) => {
	await db
		.delete(auth)
		.where(eq(auth.id, authId))
		.returning()
		.then((res) => res[0]);
};

export const getDokployUrl = async () => {
	const admin = await findAdmin();

	if (admin.host) {
		return `https://${admin.host}`;
	}
	return `http://${admin.serverIp}:${process.env.PORT}`;
};
