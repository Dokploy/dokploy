import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";

// A separate folder and table keep this journal's timestamps out of Dokploy's own,
// where the migrator would skip every upstream migration dated before them.
export const migrateLibreDBStudio = async (db: PostgresJsDatabase) =>
	await migrate(db, {
		migrationsFolder: "drizzle-libredb-studio",
		migrationsTable: "__drizzle_migrations_libredb_studio",
	})
		.then(() => {
			console.log("LibreDB Studio migration complete");
		})
		.catch((error) => {
			console.log("LibreDB Studio migration failed", error);
		});
