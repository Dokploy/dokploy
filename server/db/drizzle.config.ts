import type { Config } from "drizzle-kit";

console.log("> Generating PG Schema:", process.env.DATABASE_URL);
export default {
	schema: "./server/db/schema/index.ts",
	driver: "pg",
	dbCredentials: {
		connectionString: process.env.DATABASE_URL || "",
	},
	verbose: true,
	strict: true,
	out: "drizzle",
} satisfies Config;
