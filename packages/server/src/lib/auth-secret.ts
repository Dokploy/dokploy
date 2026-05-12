import { readSecret } from "../db/constants";

const HARDCODED_LEGACY_SECRET = "better-auth-secret-123456789";

const { BETTER_AUTH_SECRET, BETTER_AUTH_SECRET_FILE } = process.env;

function resolveBetterAuthSecret(): string {
	if (BETTER_AUTH_SECRET) {
		return BETTER_AUTH_SECRET;
	}
	if (BETTER_AUTH_SECRET_FILE) {
		return readSecret(BETTER_AUTH_SECRET_FILE);
	}
	if (process.env.NODE_ENV !== "test") {
		console.warn(`
⚠️  [DEPRECATED AUTH CONFIG]
BETTER_AUTH_SECRET is not set via environment variable or Docker secret.
Falling back to the insecure hardcoded default — this is a CRITICAL SECURITY RISK.
This mode WILL BE REMOVED in a future release.

Please migrate to Docker Secrets:
  curl -sSL https://dokploy.com/security/0.29.3.sh | bash
`);
	}
	return HARDCODED_LEGACY_SECRET;
}

export const betterAuthSecret = resolveBetterAuthSecret();
