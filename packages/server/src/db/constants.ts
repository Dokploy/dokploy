import fs from "node:fs";

export const {
	DATABASE_URL,
	POSTGRES_PASSWORD_FILE,
	POSTGRES_PASSWORD,
	POSTGRES_USER = "dokploy",
	POSTGRES_DB = "dokploy",
	POSTGRES_PORT = "5432",
} = process.env;
export const POSTGRES_HOST =
	process.env.POSTGRES_HOST ??
	(process.env.NODE_ENV === "production" ? "dokploy-postgres" : "localhost");

export function readSecret(path: string): string {
	try {
		return fs.readFileSync(path, "utf8").trim();
	} catch {
		throw new Error(`Cannot read secret at ${path}`);
	}
}

export function readDatabaseUrlPassword(databaseUrl: string): string | null {
	try {
		const password = new URL(databaseUrl).password;
		return password ? decodeURIComponent(password) : null;
	} catch {
		return null;
	}
}

const isNextProductionBuild = () =>
	process.env.NEXT_PHASE === "phase-production-build";

export function resolvePostgresPassword(options?: {
	allowDatabaseUrl?: boolean;
}): string {
	if (isNextProductionBuild()) {
		return POSTGRES_USER;
	}

	if (POSTGRES_PASSWORD_FILE) {
		return readSecret(POSTGRES_PASSWORD_FILE);
	}

	if (POSTGRES_PASSWORD) {
		return POSTGRES_PASSWORD;
	}

	if (options?.allowDatabaseUrl && DATABASE_URL) {
		const password = readDatabaseUrlPassword(DATABASE_URL);
		if (password) {
			return password;
		}
	}

	if (process.env.NODE_ENV === "production") {
		throw new Error(
			"POSTGRES_PASSWORD_FILE or POSTGRES_PASSWORD is required when DATABASE_URL is not set",
		);
	}

	return POSTGRES_USER;
}

export let dbUrl: string;
if (DATABASE_URL) {
	// Compatibilidad legacy / overrides
	dbUrl = DATABASE_URL;
} else {
	const password = resolvePostgresPassword();
	dbUrl = `postgres://${POSTGRES_USER}:${encodeURIComponent(
		password,
	)}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}`;
}
