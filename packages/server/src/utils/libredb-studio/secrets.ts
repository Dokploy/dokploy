import { isEncrypted } from "@dokploy/server/lib/encryption";

export const STUDIO_SECRETS_DECRYPTION_FAILED_MESSAGE =
	"The LibreDB Studio secrets cannot be decrypted with the current Dokploy encryption key. Restore the ENCRYPTION_KEY or BETTER_AUTH_SECRET that encrypted them, or remove this Studio and install it again.";

// encryptedText returns the stored ciphertext instead of failing when the
// Dokploy encryption key changed (db/schema/utils.ts), so a secret that still
// carries the encryption prefix was never decrypted.
export const studioSecretsAreDecrypted = (studio: {
	launchSecret: string;
	jwtSecret: string;
	adminPassword: string;
}): boolean =>
	![studio.launchSecret, studio.jwtSecret, studio.adminPassword].some(
		(secret) => isEncrypted(secret),
	);
