import fs from "node:fs";

const DEVELOPMENT_AUTH_SECRET =
	"dokploy-development-auth-secret-change-me-0000000000";
const BUILD_AUTH_SECRET = "dokploy-build-auth-secret-build-only-0000000000";
const TEST_AUTH_SECRET = "dokploy-test-auth-secret-00000000000000000000";

const { BETTER_AUTH_SECRET, BETTER_AUTH_SECRET_FILE } = process.env;

function readAuthSecret(path: string): string {
	try {
		return fs.readFileSync(path, "utf8").trim();
	} catch {
		throw new Error(`Cannot read secret at ${path}`);
	}
}

function isProductionBuild() {
	return (
		process.env.NEXT_PHASE === "phase-production-build" ||
		(process.env.npm_lifecycle_event === "build-next" &&
			process.env.npm_lifecycle_script?.includes("next build"))
	);
}

function resolveBetterAuthSecret(): string {
	if (BETTER_AUTH_SECRET) {
		return BETTER_AUTH_SECRET;
	}
	if (BETTER_AUTH_SECRET_FILE) {
		return readAuthSecret(BETTER_AUTH_SECRET_FILE);
	}

	if (process.env.NODE_ENV === "test") {
		return TEST_AUTH_SECRET;
	}

	if (process.env.NODE_ENV === "production" && isProductionBuild()) {
		console.warn(`
	⚠️  [BUILD AUTH CONFIG]
	BETTER_AUTH_SECRET is not set while building Dokploy.
	Using a build-only secret. Production runtime still requires BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE.
	`);
		return BUILD_AUTH_SECRET;
	}

	if (process.env.NODE_ENV !== "production") {
		console.warn(`
	⚠️  [DEVELOPMENT AUTH CONFIG]
	BETTER_AUTH_SECRET is not set via environment variable or Docker secret.
	Using a development-only secret. Do not use this mode in production.
	`);
		return DEVELOPMENT_AUTH_SECRET;
	}

	throw new Error(
		"BETTER_AUTH_SECRET or BETTER_AUTH_SECRET_FILE is required in production.",
	);
}

export const betterAuthSecret = resolveBetterAuthSecret();
