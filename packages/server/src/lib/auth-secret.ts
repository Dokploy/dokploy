import { readSecret } from "../db/constants";

const HARDCODED_LEGACY_SECRET = "better-auth-secret-123456789";

const { BETTER_AUTH_SECRET, BETTER_AUTH_SECRET_FILE } = process.env;

function resolveBetterAuthSecret(): string {
	if (BETTER_AUTH_SECRET) return BETTER_AUTH_SECRET;
	if (BETTER_AUTH_SECRET_FILE) return readSecret(BETTER_AUTH_SECRET_FILE);
	if (process.env.NODE_ENV === "test") return HARDCODED_LEGACY_SECRET;
	throw new Error(
		"BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE is required in non-test environments. Configure Docker secrets with POSTGRES_PASSWORD_FILE/BETTER_AUTH_SECRET_FILE or run: curl -sSL https://dokploy.com/security/0.29.4.sh | bash",
	);
}

export const betterAuthSecret = resolveBetterAuthSecret();
