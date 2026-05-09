/**
 * Use this command to automatically migrate the auth secret: curl -sSL https://dokploy.com/security/0.29.3.sh | bash
 * Migration script: re-encrypt 2FA secrets after rotating BETTER_AUTH_SECRET.
 *
 * Usage:
 *   OLD_SECRET=<old_secret> NEW_SECRET=<new_secret> npx tsx apps/dokploy/scripts/migrate-auth-secret.ts
 *
 * Both OLD_SECRET and NEW_SECRET are required.
 * Run this BEFORE restarting Dokploy with the new secret.
 */
import { db } from "@dokploy/server/db";
import { twoFactor } from "@dokploy/server/db/schema";
import { symmetricDecrypt, symmetricEncrypt } from "better-auth/crypto";
import { eq } from "drizzle-orm";

const OLD_SECRET = process.env.OLD_SECRET as string;
const NEW_SECRET = process.env.NEW_SECRET as string;

if (!OLD_SECRET || !NEW_SECRET) {
	console.error(
		"❌ OLD_SECRET and NEW_SECRET environment variables are required.",
	);
	console.error(
		"   Usage: OLD_SECRET=<old> NEW_SECRET=<new> npx tsx apps/dokploy/scripts/migrate-auth-secret.ts",
	);
	process.exit(1);
}

if (OLD_SECRET === NEW_SECRET) {
	console.error("❌ OLD_SECRET and NEW_SECRET must be different.");
	process.exit(1);
}

async function reEncrypt(
	value: string,
	oldSecret: string,
	newSecret: string,
): Promise<string> {
	const plaintext = await symmetricDecrypt({ key: oldSecret, data: value });
	return symmetricEncrypt({ key: newSecret, data: plaintext });
}

async function main() {
	console.log("🔍 Fetching 2FA records...");
	const records = await db.select().from(twoFactor);

	if (records.length === 0) {
		console.log("✅ No 2FA records found, nothing to migrate.");
		return;
	}

	console.log(`📦 Found ${records.length} 2FA record(s) to migrate.`);

	let migrated = 0;
	let failed = 0;

	await db.transaction(async (tx) => {
		for (const record of records) {
			try {
				const [newSecret, newBackupCodes] = await Promise.all([
					reEncrypt(record.secret, OLD_SECRET, NEW_SECRET),
					reEncrypt(record.backupCodes, OLD_SECRET, NEW_SECRET),
				]);

				await tx
					.update(twoFactor)
					.set({ secret: newSecret, backupCodes: newBackupCodes })
					.where(eq(twoFactor.id, record.id));

				migrated++;
			} catch (err) {
				console.error(
					`❌ Failed to migrate record ${record.id} (userId: ${record.userId}):`,
					err,
				);
				failed++;
				throw err; // rollback the whole transaction
			}
		}
	});

	console.log(`✅ Migrated ${migrated} record(s) successfully.`);

	if (failed > 0) {
		console.error(
			`❌ ${failed} record(s) failed — transaction was rolled back.`,
		);
		process.exit(1);
	} else {
		process.exit(0);
	}
}

main().catch((err) => {
	console.error("❌ Migration failed:", err);
	process.exit(1);
});
