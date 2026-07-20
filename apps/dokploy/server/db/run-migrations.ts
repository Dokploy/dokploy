import { dbUrl } from "@dokploy/server/db/constants";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export type RuntimeMigrationLogger = Pick<typeof console, "error" | "log">;

export type RunRuntimeMigrationsOptions = {
	logger?: RuntimeMigrationLogger;
	migrationsFolder?: string;
};

export const runRuntimeMigrations = async ({
	logger = console,
	migrationsFolder = "drizzle",
}: RunRuntimeMigrationsOptions = {}) => {
	const sql = postgres(dbUrl, { max: 1 });

	try {
		const db = drizzle(sql);
		await migrate(db, { migrationsFolder });
		logger.log("Migration complete");
	} catch (error) {
		logger.error("Migration failed", error);
		throw error;
	} finally {
		await sql.end();
	}
};
