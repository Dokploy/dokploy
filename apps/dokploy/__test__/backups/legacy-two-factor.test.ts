import { migrateRestoredLegacyTwoFactorSecrets } from "@dokploy/server/utils/restore/legacy-two-factor";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const currentSecret = "new-test-auth-secret";
const legacySecret = "better-auth-secret-123456789";
const state = vi.hoisted(() => ({
	records: [] as Array<{ id: string; secret: string; backupCodes: string }>,
	writes: [] as Array<{ secret: string; backupCodes: string }>,
}));

vi.mock("@dokploy/server/lib/auth-secret", () => ({
	betterAuthSecret: "new-test-auth-secret",
	HARDCODED_LEGACY_SECRET: "better-auth-secret-123456789",
}));
vi.mock("@dokploy/server/db", () => ({
	db: {
		transaction: async (
			callback: (tx: {
				select: () => { from: () => Promise<typeof state.records> };
				update: () => {
					set: (values: (typeof state.writes)[number]) => {
						where: () => Promise<void>;
					};
				};
			}) => Promise<number>,
		) =>
			callback({
				select: () => ({ from: async () => state.records }),
				update: () => ({
					set: (values) => ({
						where: async () => {
							state.writes.push(values);
						},
					}),
				}),
			}),
	},
}));

describe("restored legacy 2FA secrets", () => {
	beforeEach(() => {
		state.records = [];
		state.writes = [];
	});

	it("re-encrypts TOTP and backup codes under the active secret", async () => {
		state.records = [
			{
				id: "test-user",
				secret: await symmetricEncrypt({
					key: legacySecret,
					data: "totp-test",
				}),
				backupCodes: await symmetricEncrypt({
					key: legacySecret,
					data: "backup-test",
				}),
			},
		];

		expect(await migrateRestoredLegacyTwoFactorSecrets()).toBe(1);
		expect(state.writes).toHaveLength(1);
		const [write] = state.writes;
		if (!write) throw new Error("Expected the restored record to be migrated");
		expect(
			await symmetricDecrypt({
				key: currentSecret,
				data: write.secret,
			}),
		).toBe("totp-test");
		expect(
			await symmetricDecrypt({
				key: currentSecret,
				data: write.backupCodes,
			}),
		).toBe("backup-test");
	});

	it("leaves records already encrypted with the active secret unchanged", async () => {
		state.records = [
			{
				id: "test-user",
				secret: await symmetricEncrypt({
					key: currentSecret,
					data: "totp-test",
				}),
				backupCodes: await symmetricEncrypt({
					key: currentSecret,
					data: "backup-test",
				}),
			},
		];

		expect(await migrateRestoredLegacyTwoFactorSecrets()).toBe(0);
		expect(state.writes).toHaveLength(0);
	});

	it("fails without changing 2FA if the source used another secret", async () => {
		state.records = [
			{
				id: "test-user",
				secret: await symmetricEncrypt({
					key: "unrelated-test-secret",
					data: "totp-test",
				}),
				backupCodes: await symmetricEncrypt({
					key: "unrelated-test-secret",
					data: "backup-test",
				}),
			},
		];

		await expect(migrateRestoredLegacyTwoFactorSecrets()).rejects.toThrow(
			"Restored 2FA data cannot be decrypted",
		);
		expect(state.writes).toHaveLength(0);
	});
});
