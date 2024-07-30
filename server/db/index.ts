import { type PostgresJsDatabase, drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

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
