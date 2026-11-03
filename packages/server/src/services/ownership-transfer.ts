import { db } from "@dokploy/server/db";
import {
	backups,
	gitProvider,
	member,
	organization,
	ownershipTransfer,
	user,
	webServerSettings,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	eq,
	exists,
	gt,
	ilike,
	inArray,
	isNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { getInstanceOwnerId, invalidateTrustedOriginsCache } from "./admin";
import { createAuditLog } from "./proprietary/audit-log";
import { getWebServerSettings } from "./web-server-settings";

const OWNERSHIP_TRANSFER_TTL_MS = 48 * 60 * 60 * 1000;

const transferUserColumns = {
	id: true,
	email: true,
	firstName: true,
	lastName: true,
} as const;

type OwnershipTransferCheck = {
	status: string;
	expiresAt: Date;
	fromUserId: string;
	toUserId: string;
};

export const getTransferAcceptanceError = (
	transfer: OwnershipTransferCheck,
	{
		userId,
		instanceOwnerId,
		now = new Date(),
	}: { userId: string; instanceOwnerId: string | null; now?: Date },
) => {
	if (transfer.toUserId !== userId) {
		return "This ownership transfer is not addressed to you";
	}
	if (transfer.status !== "pending") {
		return "This ownership transfer is no longer pending";
	}
	if (transfer.expiresAt <= now) {
		return "This ownership transfer has expired";
	}
	if (transfer.fromUserId !== instanceOwnerId) {
		return "The sender no longer owns this instance";
	}
	return null;
};

// Emails created through SCIM or imports can keep their original casing, and
// the recipient search matches case-insensitively, so lookups must too.
export const userEmailEquals = (email: string) =>
	eq(sql`lower(${user.email})`, email.trim().toLowerCase());

export const findOwnedOrganizations = async (userId: string) => {
	return db.query.organization.findMany({
		where: eq(organization.ownerId, userId),
		columns: { id: true, name: true },
	});
};

export const findPendingOutgoingTransfer = async (fromUserId: string) => {
	return db.query.ownershipTransfer.findFirst({
		where: and(
			eq(ownershipTransfer.fromUserId, fromUserId),
			eq(ownershipTransfer.status, "pending"),
			gt(ownershipTransfer.expiresAt, new Date()),
		),
		with: { toUser: { columns: transferUserColumns } },
	});
};

export const findIncomingTransfers = async (toUserId: string) => {
	return db.query.ownershipTransfer.findMany({
		where: and(
			eq(ownershipTransfer.toUserId, toUserId),
			eq(ownershipTransfer.status, "pending"),
			gt(ownershipTransfer.expiresAt, new Date()),
		),
		with: { fromUser: { columns: transferUserColumns } },
	});
};

export const findOwnershipTransferById = async (transferId: string) => {
	const transfer = await db.query.ownershipTransfer.findFirst({
		where: eq(ownershipTransfer.id, transferId),
		with: {
			fromUser: { columns: transferUserColumns },
			toUser: { columns: transferUserColumns },
		},
	});

	if (!transfer) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Ownership transfer not found",
		});
	}
	return transfer;
};

const RECIPIENT_SEARCH_LIMIT = 20;

/**
 * Users the instance owner could hand ownership to, matched by email or name.
 * Prefix matches come first so typing "a" lists users starting with "a".
 */
export const searchTransferRecipients = async (
	fromUserId: string,
	query: string,
) => {
	const term = query.trim().replace(/[\\%_]/g, (char) => `\\${char}`);
	if (!term) {
		return { users: [], hasMore: false };
	}

	const contains = `%${term}%`;
	const prefix = `${term}%`;
	const fullName = sql`${user.firstName} || ' ' || ${user.lastName}`;

	const rows = await db
		.select({
			id: user.id,
			email: user.email,
			firstName: user.firstName,
			lastName: user.lastName,
		})
		.from(user)
		.where(
			and(
				ne(user.id, fromUserId),
				or(isNull(user.banned), eq(user.banned, false)),
				exists(
					db
						.select({ id: member.id })
						.from(member)
						.where(eq(member.userId, user.id)),
				),
				or(ilike(user.email, contains), ilike(fullName, contains)),
			),
		)
		.orderBy(
			sql`case
				when ${user.email} ilike ${prefix} then 0
				when ${fullName} ilike ${prefix} or ${user.lastName} ilike ${prefix} then 1
				else 2
			end`,
			asc(user.email),
		)
		.limit(RECIPIENT_SEARCH_LIMIT + 1);

	return {
		users: rows.slice(0, RECIPIENT_SEARCH_LIMIT),
		hasMore: rows.length > RECIPIENT_SEARCH_LIMIT,
	};
};

export const findTransferRecipient = async (
	fromUserId: string,
	email: string,
) => {
	const target = await db.query.user.findFirst({
		where: userEmailEquals(email),
		columns: {
			id: true,
			email: true,
			firstName: true,
			lastName: true,
			banned: true,
		},
	});

	if (!target) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message:
				"No user found with that email. Invite them to an organization first.",
		});
	}
	if (target.id === fromUserId) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "You already own this instance",
		});
	}
	if (target.banned) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "This user is deactivated",
		});
	}

	// Without a membership the recipient has no dashboard to accept from.
	const membership = await db.query.member.findFirst({
		where: eq(member.userId, target.id),
		columns: { id: true },
	});
	if (!membership) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"This user is not part of any organization. Invite them to one first.",
		});
	}

	const { banned: _banned, ...recipient } = target;
	return recipient;
};

export const createOwnershipTransfer = async (
	fromUserId: string,
	email: string,
) => {
	const target = await findTransferRecipient(fromUserId, email);

	return db.transaction(async (tx) => {
		await tx
			.update(ownershipTransfer)
			.set({ status: "canceled" })
			.where(
				and(
					eq(ownershipTransfer.fromUserId, fromUserId),
					eq(ownershipTransfer.status, "pending"),
				),
			);

		const [created] = await tx
			.insert(ownershipTransfer)
			.values({
				fromUserId,
				toUserId: target.id,
				expiresAt: new Date(Date.now() + OWNERSHIP_TRANSFER_TTL_MS),
			})
			.returning();
		return created;
	});
};

export const cancelOwnershipTransfer = async (
	transferId: string,
	fromUserId: string,
) => {
	const updated = await db
		.update(ownershipTransfer)
		.set({ status: "canceled" })
		.where(
			and(
				eq(ownershipTransfer.id, transferId),
				eq(ownershipTransfer.fromUserId, fromUserId),
				eq(ownershipTransfer.status, "pending"),
			),
		)
		.returning({ id: ownershipTransfer.id });

	if (updated.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "No pending ownership transfer found",
		});
	}
};

export const declineOwnershipTransfer = async (
	transferId: string,
	toUserId: string,
) => {
	const updated = await db
		.update(ownershipTransfer)
		.set({ status: "declined" })
		.where(
			and(
				eq(ownershipTransfer.id, transferId),
				eq(ownershipTransfer.toUserId, toUserId),
				eq(ownershipTransfer.status, "pending"),
			),
		)
		.returning({ id: ownershipTransfer.id });

	if (updated.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "No pending ownership transfer found",
		});
	}
};

export const acceptOwnershipTransfer = async (
	transferId: string,
	userId: string,
) => {
	const transfer = await findOwnershipTransferById(transferId);
	const error = getTransferAcceptanceError(transfer, {
		userId,
		instanceOwnerId: await getInstanceOwnerId(),
	});

	if (error) {
		throw new TRPCError({ code: "BAD_REQUEST", message: error });
	}

	return transferInstanceOwnership(
		transfer.fromUserId,
		transfer.toUserId,
		transferId,
	);
};

/**
 * Hands every organization owned by `fromUserId` to `toUserId` and makes
 * `toUserId` the instance owner. The previous owner stays in those
 * organizations as a plain member.
 */
export const transferInstanceOwnership = async (
	fromUserId: string,
	toUserId: string,
	transferId?: string,
) => {
	const settings = await getWebServerSettings();

	const transferred = await db.transaction(async (tx) => {
		if (transferId) {
			// Claiming the row inside the transaction makes a concurrent second
			// accept fail instead of running the transfer twice.
			const claimed = await tx
				.update(ownershipTransfer)
				.set({ status: "accepted" })
				.where(
					and(
						eq(ownershipTransfer.id, transferId),
						eq(ownershipTransfer.status, "pending"),
					),
				)
				.returning({ id: ownershipTransfer.id });

			if (claimed.length === 0) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "This ownership transfer is no longer pending",
				});
			}
		}

		await tx
			.update(ownershipTransfer)
			.set({ status: "canceled" })
			.where(
				and(
					eq(ownershipTransfer.fromUserId, fromUserId),
					eq(ownershipTransfer.status, "pending"),
				),
			);

		const organizations = await tx.query.organization.findMany({
			where: eq(organization.ownerId, fromUserId),
			columns: { id: true, name: true },
		});
		const organizationIds = organizations.map((org) => org.id);

		if (organizationIds.length > 0) {
			await tx
				.update(organization)
				.set({ ownerId: toUserId })
				.where(inArray(organization.id, organizationIds));

			const existingMemberships = await tx
				.update(member)
				.set({ role: "owner" })
				.where(
					and(
						eq(member.userId, toUserId),
						inArray(member.organizationId, organizationIds),
					),
				)
				.returning({ organizationId: member.organizationId });

			const memberOf = new Set(
				existingMemberships.map((membership) => membership.organizationId),
			);
			const missingOrganizationIds = organizationIds.filter(
				(id) => !memberOf.has(id),
			);

			if (missingOrganizationIds.length > 0) {
				await tx.insert(member).values(
					missingOrganizationIds.map((organizationId) => ({
						organizationId,
						userId: toUserId,
						role: "owner",
						createdAt: new Date(),
					})),
				);
			}

			await tx
				.update(member)
				.set({ role: "member" })
				.where(
					and(
						eq(member.userId, fromUserId),
						inArray(member.organizationId, organizationIds),
					),
				);

			// Git providers are deleted along with the user who created them, so
			// removing the previous owner later would break every deploy using one.
			await tx
				.update(gitProvider)
				.set({ userId: toUserId })
				.where(
					and(
						eq(gitProvider.userId, fromUserId),
						inArray(gitProvider.organizationId, organizationIds),
					),
				);
		}

		// Dokploy's own database backups hang off the owner's user row, and that
		// foreign key would block deleting the previous owner.
		await tx
			.update(backups)
			.set({ userId: toUserId })
			.where(eq(backups.userId, fromUserId));

		// License, SSO trusted origins and the metrics flag are read from the
		// organization owner's user row, so they have to follow the ownership.
		const ownerColumns = {
			enableEnterpriseFeatures: true,
			licenseKey: true,
			isValidEnterpriseLicense: true,
			trustedOrigins: true,
			enablePaidFeatures: true,
		} as const;
		const previousOwner = await tx.query.user.findFirst({
			where: eq(user.id, fromUserId),
			columns: ownerColumns,
		});
		const nextOwner = await tx.query.user.findFirst({
			where: eq(user.id, toUserId),
			columns: ownerColumns,
		});

		if (previousOwner && nextOwner) {
			// The new owner may already hold a license for an organization an admin
			// created before that was restricted; merge instead of overwriting it.
			const license = previousOwner.licenseKey ? previousOwner : nextOwner;
			await tx
				.update(user)
				.set({
					enableEnterpriseFeatures:
						previousOwner.enableEnterpriseFeatures ||
						nextOwner.enableEnterpriseFeatures,
					licenseKey: license.licenseKey,
					isValidEnterpriseLicense: license.isValidEnterpriseLicense,
					trustedOrigins: [
						...new Set([
							...(nextOwner.trustedOrigins ?? []),
							...(previousOwner.trustedOrigins ?? []),
						]),
					],
					enablePaidFeatures:
						previousOwner.enablePaidFeatures || nextOwner.enablePaidFeatures,
				})
				.where(eq(user.id, toUserId));
			await tx
				.update(user)
				.set({
					enableEnterpriseFeatures: false,
					licenseKey: null,
					isValidEnterpriseLicense: false,
					trustedOrigins: null,
					enablePaidFeatures: false,
				})
				.where(eq(user.id, fromUserId));
		}

		if (settings) {
			await tx
				.update(webServerSettings)
				.set({ instanceOwnerId: toUserId })
				.where(eq(webServerSettings.id, settings.id));
		}

		return organizations;
	});

	invalidateTrustedOriginsCache();

	const newOwner = await db.query.user.findFirst({
		where: eq(user.id, toUserId),
		columns: { email: true },
	});

	// createAuditLog never throws, so one failed entry can't hide the others.
	await Promise.all(
		transferred.map((org) =>
			createAuditLog({
				organizationId: org.id,
				userId: toUserId,
				userEmail: newOwner?.email ?? "",
				userRole: "owner",
				action: "update",
				resourceType: "organization",
				resourceId: org.id,
				resourceName: org.name,
				metadata: { type: "transferOwnership", fromUserId, toUserId },
			}),
		),
	);

	return { organizationsTransferred: transferred.length };
};
