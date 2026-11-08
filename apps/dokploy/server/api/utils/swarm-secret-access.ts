import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db } from "@dokploy/server/db";
import { user, verification } from "@dokploy/server/db/schema";
import { auth } from "@dokploy/server/lib/auth";
import { findCredentialAccount } from "@dokploy/server/services/user";
import { TRPCError } from "@trpc/server";
import { and, eq, like, lt, sql } from "drizzle-orm";

const ACCESS_TTL_MS = 5 * 60_000;
const ATTEMPT_LIMIT = 5;
const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");

export interface SecretAccessScope {
	userId: string;
	sessionId: string;
	organizationId: string;
	serverId?: string;
}

const accessId = (scope: SecretAccessScope) =>
	`swarm-secret-access:${hash(JSON.stringify([scope.userId, scope.sessionId, scope.organizationId, scope.serverId ?? null]))}`;

export const getSecretAccessMethod = async (userId: string) => {
	const currentUser = await db.query.user.findFirst({
		where: eq(user.id, userId),
		columns: { twoFactorEnabled: true },
	});
	if (!currentUser) throw new TRPCError({ code: "UNAUTHORIZED" });
	if (currentUser.twoFactorEnabled) return "totp" as const;
	return (await findCredentialAccount(userId))?.password
		? ("password" as const)
		: ("unavailable" as const);
};

export const unlockSwarmSecrets = async (
	scope: SecretAccessScope,
	cookie: string,
	credential: string,
) => {
	const now = new Date();
	const expiresAt = new Date(now.getTime() + ACCESS_TTL_MS);
	const attemptId = `swarm-secret-attempt:${scope.userId}`;
	// Reserve each attempt atomically, including parallel requests and other sessions.
	const [attempt] = await db
		.insert(verification)
		.values({
			id: attemptId,
			identifier: attemptId,
			value: "1",
			createdAt: now,
			updatedAt: now,
			expiresAt,
		})
		.onConflictDoUpdate({
			target: verification.id,
			set: {
				value: sql`CASE WHEN ${verification.expiresAt} <= ${now.toISOString()}::timestamp THEN '1' ELSE (LEAST(${verification.value}::int, ${ATTEMPT_LIMIT}) + 1)::text END`,
				expiresAt: sql`CASE WHEN ${verification.expiresAt} <= ${now.toISOString()}::timestamp THEN ${expiresAt.toISOString()}::timestamp ELSE ${verification.expiresAt} END`,
				updatedAt: now,
			},
		})
		.returning({ value: verification.value });
	if (!attempt || Number(attempt.value) > ATTEMPT_LIMIT) {
		throw new TRPCError({
			code: "TOO_MANY_REQUESTS",
			message:
				"Too many verification attempts. Wait five minutes and try again.",
		});
	}
	const method = await getSecretAccessMethod(scope.userId);
	if (method === "unavailable") {
		throw new TRPCError({
			code: "PRECONDITION_FAILED",
			message:
				"Set an account password or enable two-factor authentication before managing Swarm secrets.",
		});
	}
	const headers = new Headers({ cookie });
	try {
		if (method === "totp") {
			const result = await auth.verifyTOTP({
				headers,
				body: { code: credential, trustDevice: false },
			});
			if (!("user" in result) || result.user.id !== scope.userId)
				throw new Error("Verification failed");
		} else {
			const result = await auth.verifyPassword({
				headers,
				body: { password: credential },
			});
			if (!result.status) throw new Error("Verification failed");
		}
	} catch {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message:
				"Verification failed. Check your password or authenticator code.",
		});
	}
	const token = randomBytes(32).toString("hex");
	const id = accessId(scope);
	// This shared table already stores short-lived auth verification records.
	// Only a hash of the access token is persisted, never a password or secret value.
	await db
		.delete(verification)
		.where(
			and(
				like(verification.id, "swarm-secret-access:%"),
				lt(verification.expiresAt, now),
			),
		);
	await db
		.insert(verification)
		.values({
			id,
			identifier: id,
			value: hash(token),
			expiresAt,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: verification.id,
			set: { value: hash(token), expiresAt, updatedAt: now },
		});
	return { token, expiresAt: expiresAt.getTime() };
};

export const requireSwarmSecretAccess = async (
	scope: SecretAccessScope,
	token: string,
) => {
	const grant = await db.query.verification.findFirst({
		where: eq(verification.id, accessId(scope)),
	});
	const expected = Buffer.from(grant?.value ?? "", "hex");
	const actual = Buffer.from(hash(token), "hex");
	if (
		!grant ||
		grant.expiresAt.getTime() <= Date.now() ||
		expected.length !== actual.length ||
		!timingSafeEqual(expected, actual)
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "Secret access has expired. Verify your identity again.",
		});
	}
};

export const lockSwarmSecrets = async (scope: SecretAccessScope) => {
	await db.delete(verification).where(eq(verification.id, accessId(scope)));
};
