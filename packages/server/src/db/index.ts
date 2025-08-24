import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
	var db: PostgresJsDatabase<typeof schema> | undefined;
}

export let db: PostgresJsDatabase<typeof schema>;
if (process.env.NODE_ENV === "production") {
	db = drizzle(postgres(process.env.DATABASE_URL!), {
		schema,
	});
} else {
	if (!global.db)
		global.db = drizzle(postgres(process.env.DATABASE_URL!), {
			schema,
		});

	db = global.db;
}
