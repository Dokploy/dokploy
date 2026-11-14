import { dbUrl } from "@dokploy/server/db";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	// The libredb_studio table has its own migrations folder and table, see
	// drizzle.libredb-studio.config.ts; dbml.ts writes a file when imported.
	schema: "../../packages/server/src/db/schema/!(index|dbml|libredb-studio).ts",
	tablesFilter: ["!libredb_studio"],
	dialect: "postgresql",
	dbCredentials: {
		url: dbUrl,
	},
	out: "drizzle",
	migrations: {
		table: "migrations",
		schema: "public",
	},
});
