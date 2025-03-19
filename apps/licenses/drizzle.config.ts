import type { Config } from "drizzle-kit";
import "dotenv/config";

const connectionString = process.env.DATABASE_URL!;

export default {
	schema: "./src/schema.ts",
	out: "./drizzle",
	dialect: "postgresql",
	dbCredentials: {
		url: connectionString,
	},
	verbose: true,
	strict: true,
} satisfies Config;
