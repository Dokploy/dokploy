import { IS_CLOUD } from "@dokploy/server/constants";
import { db } from "@dokploy/server/db";
import { session as sessionTable } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";
import { getWebServerSettings } from "./web-server-settings";

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

export const isSensitiveVerificationEnabled = async () => {
	if (IS_CLOUD) return false;
	const settings = await getWebServerSettings();
	return !!settings?.requireSensitiveActionVerification;
};

export const isSensitiveActionAllowed = async ({
	sessionId,
	impersonatedBy,
	isApiKeyRequest,
}: {
	sessionId: string | undefined;
	impersonatedBy: string | null | undefined;
	isApiKeyRequest: boolean;
}) => {
	if (isApiKeyRequest) return true;
	if (!(await isSensitiveVerificationEnabled())) return true;
	if (impersonatedBy || !sessionId) return false;

	const row = await db.query.session.findFirst({
		where: eq(sessionTable.id, sessionId),
		columns: { createdAt: true, sensitiveVerifiedAt: true },
	});
	return !!row && isSessionFresh(row);
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
