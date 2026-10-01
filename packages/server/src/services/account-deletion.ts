import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { db } from "@dokploy/server/db";
import {
	auditLog,
	backups,
	invitation,
	organization,
	user,
	verification,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

export const ANONYMIZED_EMAIL = "deleted-user";
export const ACCOUNT_DELETION_CODE_TTL_MINUTES = 10;
const ACCOUNT_DELETION_CODE_RESEND_SECONDS = 60;
const ACCOUNT_DELETION_CODE_MAX_ATTEMPTS = 5;

const codeIdentifier = (userId: string) => `account-deletion:${userId}`;

const hashCode = (code: string) =>
	createHash("sha256").update(code.trim()).digest("hex");

export const generateDeletionCode = () =>
	randomInt(0, 1_000_000).toString().padStart(6, "0");

export const serializeDeletionCode = (code: string) =>
	JSON.stringify({ hash: hashCode(code), attempts: 0 });

export const checkDeletionCode = (value: string, code: string) => {
	const stored = JSON.parse(value) as { hash: string; attempts: number };
	const expected = Buffer.from(stored.hash, "hex");
	const actual = Buffer.from(hashCode(code), "hex");

	if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
		return { valid: true as const, attempts: stored.attempts };
	}

	const attempts = stored.attempts + 1;
	return {
		valid: false as const,
		attempts,
		nextValue: JSON.stringify({ ...stored, attempts }),
	};
};

export const createAccountDeletionCode = async (userId: string) => {
	const identifier = codeIdentifier(userId);
	const existing = await db.query.verification.findFirst({
		where: eq(verification.identifier, identifier),
	});

	if (
		existing?.createdAt &&
		Date.now() - existing.createdAt.getTime() <
			ACCOUNT_DELETION_CODE_RESEND_SECONDS * 1000
	) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message: `Wait ${ACCOUNT_DELETION_CODE_RESEND_SECONDS} seconds before requesting a new code`,
		});
	}

	await db.delete(verification).where(eq(verification.identifier, identifier));

	const code = generateDeletionCode();
	const now = new Date();
	await db.insert(verification).values({
		id: nanoid(),
		identifier,
		value: serializeDeletionCode(code),
		expiresAt: new Date(
			now.getTime() + ACCOUNT_DELETION_CODE_TTL_MINUTES * 60_000,
		),
		createdAt: now,
		updatedAt: now,
	});

	return code;
};

export const consumeAccountDeletionCode = async (
	userId: string,
	code: string,
) => {
	const row = await db.query.verification.findFirst({
		where: eq(verification.identifier, codeIdentifier(userId)),
	});

	if (!row) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Request a confirmation code first",
		});
	}

	if (row.expiresAt.getTime() < Date.now()) {
		await db.delete(verification).where(eq(verification.id, row.id));
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The code has expired, request a new one",
		});
	}

	const result = checkDeletionCode(row.value, code);
	if (!result.valid) {
		if (result.attempts >= ACCOUNT_DELETION_CODE_MAX_ATTEMPTS) {
			await db.delete(verification).where(eq(verification.id, row.id));
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Too many incorrect attempts, request a new code",
			});
		}
		await db
			.update(verification)
			.set({ value: result.nextValue, updatedAt: new Date() })
			.where(eq(verification.id, row.id));
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "The code is incorrect",
		});
	}

	await db.delete(verification).where(eq(verification.id, row.id));

	return { requestedAt: row.createdAt };
};

export const deleteUserAccountData = async (userId: string) => {
	return db.transaction(async (tx) => {
		const target = await tx.query.user.findFirst({
			where: eq(user.id, userId),
			columns: { id: true, email: true },
		});

		if (!target) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "User not found",
			});
		}

		const ownedOrganizations = await tx.query.organization.findMany({
			where: eq(organization.ownerId, userId),
			columns: { id: true },
		});
		const organizationIds = ownedOrganizations.map((org) => org.id);

		if (organizationIds.length > 0) {
			await tx
				.delete(auditLog)
				.where(inArray(auditLog.organizationId, organizationIds));
		}

		// Actions performed in organizations owned by someone else stay in
		// their audit trail, but without the deleted user's PII.
		await tx
			.update(auditLog)
			.set({ userEmail: ANONYMIZED_EMAIL })
			.where(eq(auditLog.userId, userId));

		await tx.delete(invitation).where(eq(invitation.email, target.email));

		// backups.userId has no ON DELETE clause, so a leftover reference would
		// abort the user delete.
		await tx
			.update(backups)
			.set({ userId: null })
			.where(eq(backups.userId, userId));

		await tx.delete(user).where(eq(user.id, userId));

		return {
			email: target.email,
			organizationsDeleted: organizationIds.length,
		};
	});
};
