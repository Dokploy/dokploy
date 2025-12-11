import { db } from "@dokploy/server/db";
import {
	invitation,
	member,
	organization,
	user,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";

export const findUserById = async (userId: string) => {
	const userResult = await db.query.user.findFirst({
		where: eq(user.id, userId),
		// with: {
		// 	account: true,
		// },
	});
	if (!userResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return userResult;
};

export const findOrganizationById = async (organizationId: string) => {
	const organizationResult = await db.query.organization.findFirst({
		where: eq(organization.id, organizationId),
		with: {
			owner: true,
		},
	});
	return organizationResult;
};

export const isAdminPresent = async () => {
	const admin = await db.query.member.findFirst({
		where: eq(member.role, "owner"),
	});

	if (!admin) {
		return false;
	}
	return true;
};

export const findAdmin = async () => {
	const admin = await db.query.member.findFirst({
		where: eq(member.role, "owner"),
		with: {
			user: true,
		},
	});

	if (!admin) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Admin not found",
		});
	}
	return admin;
};

export const getUserByToken = async (token: string) => {
	const userResult = await db.query.invitation.findFirst({
		where: eq(invitation.id, token),
		columns: {
			id: true,
			email: true,
			status: true,
			expiresAt: true,
			role: true,
			inviterId: true,
		},
	});

	if (!userResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Invitation not found",
		});
	}

	const userAlreadyExists = await db.query.user.findFirst({
		where: eq(user.email, userResult?.email || ""),
	});

	const { expiresAt, ...rest } = userResult;
	return {
		...rest,
		isExpired: userResult.expiresAt < new Date(),
		userAlreadyExists: !!userAlreadyExists,
	};
};

export const removeUserById = async (userId: string) => {
	await db
		.delete(user)
		.where(eq(user.id, userId))
		.returning()
		.then((res) => res[0]);
};

export const getDokployUrl = async () => {
	if (IS_CLOUD) {
		return "https://app.dokploy.com";
	}
	const admin = await findAdmin();

	if (admin.user.host) {
		const protocol = admin.user.https ? "https" : "http";
		return `${protocol}://${admin.user.host}`;
	}
	return `http://${admin.user.serverIp}:${process.env.PORT}`;
};
