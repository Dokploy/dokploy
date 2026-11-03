import { db } from "@dokploy/server/db";
import {
	invitation,
	member,
	organization,
	user,
	webServerSettings,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { asc, eq } from "drizzle-orm";
import { IS_CLOUD } from "../constants";
import { getWebServerSettings } from "./web-server-settings";

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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Registration closes after the first sign-up, so the earliest user holding
// an owner role is the instance owner even if their first organization was
// deleted. "createdAt" keeps the real sign-up time; created_at was added
// later with the same default for every existing user.
const findFirstOwnerId = async (executor: Pick<typeof db, "select"> = db) => {
	const [firstOwner] = await executor
		.select({ userId: member.userId })
		.from(member)
		.innerJoin(user, eq(member.userId, user.id))
		.where(eq(member.role, "owner"))
		.orderBy(asc(user.createdAt2))
		.limit(1);
	return firstOwner?.userId ?? null;
};

export const getInstanceOwnerId = async () => {
	const settings = await getWebServerSettings();
	return settings?.instanceOwnerId ?? findFirstOwnerId();
};

/**
 * Runs `fn` in a transaction that locks the row recording the instance owner.
 * Ownership transfers lock it exclusively and anything that depends on who
 * the owner is locks it shared, so the two can't interleave: a transfer sees
 * every organization created before it, and later creations see the new owner.
 */
export const withInstanceOwnerLock = async <T>(
	strength: "update" | "share",
	fn: (lock: {
		tx: Transaction;
		instanceOwnerId: string | null;
		settingsId: string;
	}) => Promise<T>,
) => {
	const settings = await getWebServerSettings();
	if (!settings) {
		throw new TRPCError({
			code: "INTERNAL_SERVER_ERROR",
			message: "Web server settings not found",
		});
	}

	return db.transaction(async (tx) => {
		const [locked] = await tx
			.select({ instanceOwnerId: webServerSettings.instanceOwnerId })
			.from(webServerSettings)
			.where(eq(webServerSettings.id, settings.id))
			.for(strength);

		return fn({
			tx,
			settingsId: settings.id,
			instanceOwnerId: locked?.instanceOwnerId ?? (await findFirstOwnerId(tx)),
		});
	});
};

export const isInstanceOwner = async (userId: string) => {
	return (await getInstanceOwnerId()) === userId;
};

export const findOwner = async () => {
	const instanceOwnerId = await getInstanceOwnerId();
	// Several members may hold the owner role (admins could create their own
	// organizations before that was restricted), and the instance owner may own
	// no organization at all, so match them by any membership.
	const admin = await db.query.member.findFirst({
		where: instanceOwnerId
			? eq(member.userId, instanceOwnerId)
			: eq(member.role, "owner"),
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
	const settings = await getWebServerSettings();

	if (settings?.host) {
		const protocol = settings?.https ? "https" : "http";
		return `${protocol}://${settings?.host}`;
	}
	return `http://${settings?.serverIp}:${process.env.PORT}`;
};

const TRUSTED_ORIGINS_CACHE_TTL_MS = 30 * 60_000;
let trustedOriginsCache: { data: string[]; expiresAt: number } | null = null;

export const invalidateTrustedOriginsCache = () => {
	trustedOriginsCache = null;
};

export const getTrustedOrigins = async () => {
	const runQuery = async () => {
		const rows = await db
			.select({ trustedOrigins: user.trustedOrigins })
			.from(member)
			.innerJoin(user, eq(member.userId, user.id))
			.where(eq(member.role, "owner"));
		return Array.from(new Set(rows.flatMap((r) => r.trustedOrigins ?? [])));
	};

	if (IS_CLOUD) {
		const now = Date.now();
		if (trustedOriginsCache && now < trustedOriginsCache.expiresAt) {
			return trustedOriginsCache.data;
		}
		try {
			const trustedOrigins = await runQuery();
			trustedOriginsCache = {
				data: trustedOrigins,
				expiresAt: now + TRUSTED_ORIGINS_CACHE_TTL_MS,
			};
			return trustedOrigins;
		} catch (error) {
			console.error("Failed to fetch trusted origins:", error);
			return trustedOriginsCache?.data ?? [];
		}
	}

	try {
		return await runQuery();
	} catch (error) {
		console.error("Failed to fetch trusted origins:", error);
		return [];
	}
};

export const getTrustedProviders = async () => {
	try {
		const providers = await db.query.ssoProvider.findMany();
		return providers.map((provider) => provider.providerId);
	} catch (error) {
		return [];
	}
};
