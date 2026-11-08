import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
	findUser: vi.fn(),
	findGrant: vi.fn(),
	insert: vi.fn(),
	delete: vi.fn(),
	password: vi.fn(),
	totp: vi.fn(),
	account: vi.fn(),
	attempts: 1,
	rows: [] as Record<string, any>[],
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		query: {
			user: { findFirst: mock.findUser },
			verification: { findFirst: mock.findGrant },
		},
		insert: mock.insert,
		delete: mock.delete,
	},
}));
vi.mock("@dokploy/server/lib/auth", () => ({
	auth: { verifyPassword: mock.password, verifyTOTP: mock.totp },
}));
vi.mock("@dokploy/server/services/user", () => ({
	findCredentialAccount: mock.account,
}));

import {
	getSecretAccessMethod,
	lockSwarmSecrets,
	requireSwarmSecretAccess,
	type SecretAccessScope,
	unlockSwarmSecrets,
} from "@/server/api/utils/swarm-secret-access";

const scope: SecretAccessScope = {
	userId: "user-1",
	sessionId: "session-1",
	organizationId: "org-1",
	serverId: "server-1",
};
const dialect = new PgDialect();

beforeEach(() => {
	vi.resetAllMocks();
	vi.useFakeTimers();
	vi.setSystemTime(new Date("2026-11-08T09:00:00Z"));
	mock.rows = [];
	mock.attempts = 1;
	mock.findUser.mockResolvedValue({ twoFactorEnabled: false });
	mock.account.mockResolvedValue({ password: "existing-hash" });
	mock.password.mockResolvedValue({ status: true });
	mock.totp.mockResolvedValue({
		user: { id: scope.userId },
		token: "existing-session-token",
	});
	mock.insert.mockImplementation(() => ({
		values: (row: Record<string, any>) => {
			mock.rows.push(row);
			return {
				onConflictDoUpdate: () => ({
					returning: async () => [{ value: String(mock.attempts) }],
				}),
			};
		},
	}));
	mock.delete.mockImplementation(() => ({
		where: vi.fn().mockResolvedValue(undefined),
	}));
	mock.findGrant.mockImplementation(async ({ where }) => {
		const id = dialect.sqlToQuery(where).params[0];
		return mock.rows.find((row) => row.id === id);
	});
});
afterEach(() => vi.useRealTimers());

describe("Swarm secret identity verification", () => {
	it("rejects an unsuccessful password result", async () => {
		mock.password.mockResolvedValue({ status: false });
		await expect(
			unlockSwarmSecrets(scope, "cookie", "password"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
	it("rejects a TOTP result for another account", async () => {
		mock.findUser.mockResolvedValue({ twoFactorEnabled: true });
		mock.totp.mockResolvedValue({
			user: { id: "other-user" },
			token: "other-session-token",
		});
		await expect(
			unlockSwarmSecrets(scope, "cookie", "123456"),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
	it("verifies the current account password and stores only an access-token hash", async () => {
		const grant = await unlockSwarmSecrets(
			scope,
			"session=cookie",
			"PRIVATE_PASSWORD",
		);
		expect(grant.token).toMatch(/^[a-f0-9]{64}$/);
		expect(grant.expiresAt).toBe(Date.now() + 300000);
		expect(mock.password).toHaveBeenCalledWith({
			headers: expect.any(Headers),
			body: { password: "PRIVATE_PASSWORD" },
		});
		expect(mock.totp).not.toHaveBeenCalled();
		const stored = mock.rows.find((row) =>
			row.id.startsWith("swarm-secret-access:"),
		);
		expect(stored?.value).toBe(
			createHash("sha256").update(grant.token).digest("hex"),
		);
		expect(JSON.stringify(mock.rows)).not.toContain("PRIVATE_PASSWORD");
		expect(JSON.stringify(mock.rows)).not.toContain(grant.token);
		await expect(
			requireSwarmSecretAccess(scope, grant.token),
		).resolves.toBeUndefined();
	});
	it("requires the authenticator when 2FA is enabled, without falling back to a password", async () => {
		mock.findUser.mockResolvedValue({ twoFactorEnabled: true });
		await unlockSwarmSecrets(scope, "session=cookie", "123456");
		expect(mock.totp).toHaveBeenCalledWith({
			headers: expect.any(Headers),
			body: { code: "123456", trustDevice: false },
		});
		expect(mock.password).not.toHaveBeenCalled();
	});
	it.each(["password", "totp"] as const)(
		"does not issue a grant after failed %s verification",
		async (method) => {
			mock.findUser.mockResolvedValue({ twoFactorEnabled: method === "totp" });
			mock[method].mockRejectedValue(new Error("PRIVATE_DIAGNOSTIC"));
			const error = await unlockSwarmSecrets(
				scope,
				"session=cookie",
				"wrong",
			).catch((error) => error);
			expect(error.code).toBe("UNAUTHORIZED");
			expect(error.message).not.toContain("PRIVATE_DIAGNOSTIC");
			expect(error.cause).toBeUndefined();
			expect(
				mock.rows.some((row) => row.id.startsWith("swarm-secret-access:")),
			).toBe(false);
		},
	);
	it("blocks verification before checking credentials when the attempt limit is reached", async () => {
		mock.attempts = 6;
		await expect(
			unlockSwarmSecrets(scope, "cookie", "wrong"),
		).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		expect(mock.password).not.toHaveBeenCalled();
		expect(mock.totp).not.toHaveBeenCalled();
	});
	it("does not bypass verification for SSO-only accounts", async () => {
		mock.account.mockResolvedValue(undefined);
		expect(await getSecretAccessMethod(scope.userId)).toBe("unavailable");
		await expect(
			unlockSwarmSecrets(scope, "cookie", "value"),
		).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
	});
	it.each(["userId", "sessionId", "organizationId", "serverId"] as const)(
		"does not reuse a grant with a different %s",
		async (key) => {
			const grant = await unlockSwarmSecrets(scope, "cookie", "password");
			await expect(
				requireSwarmSecretAccess({ ...scope, [key]: "other" }, grant.token),
			).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		},
	);
	it("does not reuse remote access for the local server", async () => {
		const grant = await unlockSwarmSecrets(scope, "cookie", "password");
		await expect(
			requireSwarmSecretAccess({ ...scope, serverId: undefined }, grant.token),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
	it("expires at the exact five-minute boundary", async () => {
		const grant = await unlockSwarmSecrets(scope, "cookie", "password");
		vi.setSystemTime(grant.expiresAt);
		await expect(
			requireSwarmSecretAccess(scope, grant.token),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
	it("rejects missing and incorrect tokens", async () => {
		await expect(
			requireSwarmSecretAccess(scope, "a".repeat(64)),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
		await unlockSwarmSecrets(scope, "cookie", "password");
		await expect(
			requireSwarmSecretAccess(scope, "a".repeat(64)),
		).rejects.toMatchObject({ code: "UNAUTHORIZED" });
	});
	it("deletes the scoped grant when locked", async () => {
		await lockSwarmSecrets(scope);
		expect(mock.delete).toHaveBeenCalled();
	});
});
