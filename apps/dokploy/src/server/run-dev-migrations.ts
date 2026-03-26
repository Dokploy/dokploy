import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { dbUrl } from "@dokploy/server/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const resolveMigrationsFolder = (): string => {
	const fromCwd = path.resolve(process.cwd(), "drizzle");
	if (fs.existsSync(fromCwd)) {
		return fromCwd;
	}

	const fromThisFile = path.resolve(
		path.dirname(fileURLToPath(import.meta.url)),
		"../../drizzle",
	);
	if (fs.existsSync(fromThisFile)) {
		return fromThisFile;
	}

	throw new Error(
		`Drizzle migrations folder not found. Tried: ${fromCwd}, ${fromThisFile}`,
	);
};

/** В dev Turbopack/Next не гоняют migration.mjs — без этого INSERT в payment падает, если 0153 не применён. */
export const runDevMigrations = async (): Promise<void> => {
	const migrationsFolder = resolveMigrationsFolder();
	const sql = postgres(dbUrl, { max: 1 });

	try {
		await migrate(drizzle(sql), { migrationsFolder });
		console.log("[dev] Drizzle migrations OK");
	} finally {
		await sql.end({ timeout: 5 });
	}
};
