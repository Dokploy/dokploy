import { dbUrl } from "@dokploy/server/db";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "../../packages/server/src/db/schema/libredb-studio.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: dbUrl,
	},
	out: "drizzle-libredb-studio",
	migrations: {
		table: "__drizzle_migrations_libredb_studio",
		schema: "drizzle",
	},
});
