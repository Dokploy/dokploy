import { db } from "@dokploy/server/db";
import {
	backups,
	gitProvider,
	invitation,
	member,
	organization,
	user,
	webServerSettings,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import {
	and,
	asc,
	eq,
	exists,
	inArray,
	isNotNull,
	isNull,
	ne,
	or,
	sql,
} from "drizzle-orm";
import {
	getInstanceOwnerId,
	type InstanceOwnerLock,
	invalidateTrustedOriginsCache,
	withInstanceOwnerLock,
} from "./admin";
import { createAuditLog } from "./proprietary/audit-log";
import { getWebServerSettings } from "./web-server-settings";

const OWNERSHIP_TRANSFER_TTL_MS = 48 * 60 * 60 * 1000;

const userColumns = {
	id: true,
	email: true,
	firstName: true,
	lastName: true,
} as const;

const noPendingTransfer = {
	pendingOwnerId: null,
	pendingOwnerExpiresAt: null,
};

export const getTransferAcceptanceError = (
	pending: Pick<InstanceOwnerLock, "pendingOwnerId" | "pendingOwnerExpiresAt">,
	userId: string,
	now = new Date(),
) => {
	if (pending.pendingOwnerId !== userId) {
		return "There is no pending ownership transfer for you";
	}
	if (!pending.pendingOwnerExpiresAt || pending.pendingOwnerExpiresAt <= now) {
		return "This ownership transfer has expired";
	}
	return null;
};

export const userEmailEquals = (email: string) =>
	eq(sql`lower(${user.email})`, email.trim().toLowerCase());

export const findOwnedOrganizations = async (userId: string) => {
	return db.query.organization.findMany({
		where: eq(organization.ownerId, userId),
		columns: { id: true, name: true },
	});
};

const findActivePendingTransfer = async () => {
	const settings = await getWebServerSettings();
	if (
		!settings?.pendingOwnerId ||
		!settings.pendingOwnerExpiresAt ||
		getTransferAcceptanceError(settings, settings.pendingOwnerId)
	) {
		return null;
	}
	return {
		toUserId: settings.pendingOwnerId,
		expiresAt: settings.pendingOwnerExpiresAt,
	};
};

export const findPendingOutgoingTransfer = async () => {
	const pending = await findActivePendingTransfer();
	if (!pending) {
		return null;
	}

	const toUser = await db.query.user.findFirst({
		where: eq(user.id, pending.toUserId),
		columns: userColumns,
	});
	return toUser ? { toUser, expiresAt: pending.expiresAt } : null;
};

export const findIncomingTransfer = async (userId: string) => {
	const pending = await findActivePendingTransfer();
	const fromUserId = await getInstanceOwnerId();
	if (pending?.toUserId !== userId || !fromUserId) {
		return null;
	}

	const fromUser = await db.query.user.findFirst({
		where: eq(user.id, fromUserId),
		columns: userColumns,
	});
	if (!fromUser) {
		return null;
	}

	return {
		fromUser,
		expiresAt: pending.expiresAt,
		organizations: await findOwnedOrganizations(fromUser.id),
	};
};

export const listTransferRecipients = async (fromUserId: string) => {
	return db
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
			),
		)
		.orderBy(asc(user.email));
};

export const findTransferRecipient = async (
	fromUserId: string,
	email: string,
) => {
	const target = await db.query.user.findFirst({
		where: userEmailEquals(email),
		columns: { ...userColumns, banned: true },
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
	const recipient = await findTransferRecipient(fromUserId, email);

	return withInstanceOwnerLock(
		"update",
		async ({ tx, instanceOwnerId, settingsId }) => {
			if (instanceOwnerId !== fromUserId) {
				throw new TRPCError({
					code: "FORBIDDEN",
					message: "Only the instance owner can transfer ownership",
				});
			}

			const expiresAt = new Date(Date.now() + OWNERSHIP_TRANSFER_TTL_MS);
			await tx
				.update(webServerSettings)
				.set({ pendingOwnerId: recipient.id, pendingOwnerExpiresAt: expiresAt })
				.where(eq(webServerSettings.id, settingsId));

			return { toUser: recipient, expiresAt };
		},
	);
};

const clearPendingTransfer = async (pendingOwnerId?: string) => {
	const settings = await getWebServerSettings();
	const cleared = await db
		.update(webServerSettings)
		.set(noPendingTransfer)
		.where(
			and(
				eq(webServerSettings.id, settings?.id ?? ""),
				pendingOwnerId
					? eq(webServerSettings.pendingOwnerId, pendingOwnerId)
					: isNotNull(webServerSettings.pendingOwnerId),
			),
		)
		.returning({ id: webServerSettings.id });

	if (cleared.length === 0) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "No pending ownership transfer found",
		});
	}
};

export const cancelOwnershipTransfer = async () => clearPendingTransfer();

export const declineOwnershipTransfer = async (userId: string) =>
	clearPendingTransfer(userId);

const moveOwnership = async (
	{ tx, settingsId }: InstanceOwnerLock,
	fromUserId: string,
	toUserId: string,
) => {
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

		await tx
			.update(gitProvider)
			.set({ userId: toUserId })
			.where(
				and(
					eq(gitProvider.userId, fromUserId),
					inArray(gitProvider.organizationId, organizationIds),
				),
			);

		await tx
			.update(invitation)
			.set({ inviterId: toUserId })
			.where(
				and(
					eq(invitation.inviterId, fromUserId),
					eq(invitation.status, "pending"),
					inArray(invitation.organizationId, organizationIds),
				),
			);
	}

	await tx
		.update(backups)
		.set({ userId: toUserId })
		.where(eq(backups.userId, fromUserId));

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
		const license =
			[previousOwner, nextOwner].find(
				(owner) => owner.isValidEnterpriseLicense,
			) ?? (previousOwner.licenseKey ? previousOwner : nextOwner);
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

	await tx
		.update(webServerSettings)
		.set({ instanceOwnerId: toUserId, ...noPendingTransfer })
		.where(eq(webServerSettings.id, settingsId));

	return organizations;
};

const recordTransfer = async (
	fromUserId: string,
	toUserId: string,
	organizations: { id: string; name: string }[],
) => {
	invalidateTrustedOriginsCache();

	const newOwner = await db.query.user.findFirst({
		where: eq(user.id, toUserId),
		columns: { email: true },
	});

	await Promise.all(
		organizations.map((org) =>
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

	return { organizationsTransferred: organizations.length };
};

export const acceptOwnershipTransfer = async (userId: string) => {
	const { fromUserId, organizations } = await withInstanceOwnerLock(
		"update",
		async (lock) => {
			const error = getTransferAcceptanceError(lock, userId);
			if (error || !lock.instanceOwnerId) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: error ?? "This instance has no owner",
				});
			}
			return {
				fromUserId: lock.instanceOwnerId,
				organizations: await moveOwnership(lock, lock.instanceOwnerId, userId),
			};
		},
	);

	return recordTransfer(fromUserId, userId, organizations);
};

export const transferInstanceOwnership = async (
	fromUserId: string,
	toUserId: string,
) => {
	const organizations = await withInstanceOwnerLock("update", async (lock) => {
		if (lock.instanceOwnerId !== fromUserId) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "The sender no longer owns this instance",
			});
		}
		return moveOwnership(lock, fromUserId, toUserId);
	});

	return recordTransfer(fromUserId, toUserId, organizations);
};
