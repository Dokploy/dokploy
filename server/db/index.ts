import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import postgres from "postgres";

declare global {
	// eslint-disable-next-line no-var -- only var works here
	var db: PostgresJsDatabase<typeof schema> | undefined;
}

export let db: PostgresJsDatabase<typeof schema>;
if (process.env.NODE_ENV === "production") {
	db = drizzle(postgres(process.env.DATABASE_URL || ""), {
		schema,
	});
} else {
	if (!global.db)
		global.db = drizzle(postgres(process.env.DATABASE_URL || ""), {
			schema,
		});

	db = global.db;
}
