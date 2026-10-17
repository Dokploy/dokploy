import { db } from "@dokploy/server/db";
import { twoFactor } from "@dokploy/server/db/schema";
import {
	betterAuthSecret,
	HARDCODED_LEGACY_SECRET,
} from "@dokploy/server/lib/auth-secret";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const reencryptIfLegacy = async (
	value: string,
): Promise<string | undefined> => {
	try {
		await symmetricDecrypt({ key: betterAuthSecret, data: value });
		return undefined;
	} catch {
		let plaintext: string;
		try {
			plaintext = await symmetricDecrypt({
				key: HARDCODED_LEGACY_SECRET,
				data: value,
			});
		} catch {
			throw new Error(
				"Restored 2FA data cannot be decrypted with the current or legacy auth secret. Restore the original BETTER_AUTH_SECRET before continuing.",
			);
		}
		return symmetricEncrypt({ key: betterAuthSecret, data: plaintext });
	}
};

export const migrateRestoredLegacyTwoFactorSecrets = async () => {
	return db.transaction(async (tx) => {
		const records = await tx.select().from(twoFactor);
		let migrated = 0;
		for (const record of records) {
			const secret = await reencryptIfLegacy(record.secret);
			const backupCodes = await reencryptIfLegacy(record.backupCodes);
			if (secret || backupCodes) {
				await tx
					.update(twoFactor)
					.set({
						secret: secret ?? record.secret,
						backupCodes: backupCodes ?? record.backupCodes,
					})
					.where(eq(twoFactor.id, record.id));
				migrated++;
			}
		}
		return migrated;
	});
};
