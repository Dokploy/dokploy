import { db } from "@dokploy/server/db";
import {
	member,
	organization,
	session as sessionTable,
} from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";

export const SENSITIVE_VERIFICATION_REQUIRED =
	"SENSITIVE_VERIFICATION_REQUIRED";
export const SENSITIVE_WINDOW_MS = 5 * 60 * 1000;

export const isSessionFresh = (
	session: { createdAt: Date; sensitiveVerifiedAt: Date | null },
	now = Date.now(),
) => {
	const lastVerifiedAt = Math.max(
		session.createdAt.getTime(),
		session.sensitiveVerifiedAt?.getTime() ?? 0,
	);
	return now - lastVerifiedAt <= SENSITIVE_WINDOW_MS;
};

// Account-wide on purpose: switching the active org must not dodge the check.
const isRequiredForUser = async (userId: string) => {
	const [row] = await db
		.select({ id: member.id })
		.from(member)
		.innerJoin(organization, eq(organization.id, member.organizationId))
		.where(
			and(
				eq(member.userId, userId),
				eq(organization.requireSensitiveActionVerification, true),
			),
		)
		.limit(1);
	return !!row;
};

export const isSensitiveActionAllowed = async ({
	sessionId,
	isApiKeyRequest,
}: {
	sessionId: string | undefined;
	isApiKeyRequest: boolean;
}) => {
	if (isApiKeyRequest) return true;
	if (!sessionId) return false;

	const row = await db.query.session.findFirst({
		where: eq(sessionTable.id, sessionId),
		columns: {
			userId: true,
			createdAt: true,
			sensitiveVerifiedAt: true,
			impersonatedBy: true,
		},
	});
	if (!row) return false;
	if (!(await isRequiredForUser(row.userId))) return true;
	return !row.impersonatedBy && isSessionFresh(row);
};

export const markSessionVerified = async (sessionId: string) => {
	await db
		.update(sessionTable)
		.set({ sensitiveVerifiedAt: new Date() })
		.where(eq(sessionTable.id, sessionId));
};

const MAX_VERIFICATION_ATTEMPTS = 5;
const verificationAttempts = new Map<
	string,
	{ count: number; firstAt: number }
>();

// Counted before verifying so parallel guesses can't all slip past the limit.
export const consumeVerificationAttempt = (
	userId: string,
	now = Date.now(),
) => {
	const entry = verificationAttempts.get(userId);
	if (!entry || now - entry.firstAt > SENSITIVE_WINDOW_MS) {
		verificationAttempts.set(userId, { count: 1, firstAt: now });
		return true;
	}
	entry.count += 1;
	return entry.count <= MAX_VERIFICATION_ATTEMPTS;
};

export const resetVerificationAttempts = (userId: string) => {
	verificationAttempts.delete(userId);
};
