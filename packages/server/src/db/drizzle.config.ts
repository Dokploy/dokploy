import { defineConfig } from "drizzle-kit";

export default defineConfig({
	schema: "./server/db/schema/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: process.env.DATABASE_URL!,
	},
	out: "drizzle",
	migrations: {
		table: "migrations",
		schema: "public",
	},
});
