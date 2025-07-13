import { db } from "@dokploy/server/db";
import {
	invitation,
	member,
	organization,
	users,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { findWebServer } from "./web-server";

export const findUserById = async (userId: string) => {
	const user = await db.query.users.findFirst({
		where: eq(users.id, userId),
	});
	if (!user) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "User not found",
		});
	}
	return user;
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

export const findOwner = async () => {
	const owner = await db.query.member.findFirst({
		where: eq(member.role, "owner"),
		with: {
			user: true,
		},
	});

	if (!owner) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Owner not found",
		});
	}
	return owner;
};

export const getUserByToken = async (token: string) => {
	const user = await db.query.invitation.findFirst({
		where: eq(invitation.id, token),
		columns: {
			id: true,
			email: true,
			status: true,
			expiresAt: true,
			role: true,
			inviterId: true,
			organizationId: true,
		},
	});

	if (!user) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Invitation not found",
		});
	}

	const userAlreadyExists = await db.query.users.findFirst({
		where: eq(users.email, user?.email || ""),
	});

	const { expiresAt, ...rest } = user;
	return {
		...rest,
		isExpired: user.expiresAt < new Date(),
		userAlreadyExists: !!userAlreadyExists,
	};
};

export const removeUserById = async (userId: string) => {
	await db
		.delete(users)
		.where(eq(users.id, userId))
		.returning()
		.then((res) => res[0]);
};

export const getDokployUrl = async () => {
	if (IS_CLOUD) {
		return "https://app.dokploy.com";
	}
	const webServer = await findWebServer();

	if (webServer.host) {
		return `https://${webServer.host}`;
	}
	return `http://${webServer.serverIp}:${process.env.PORT}`;
};
