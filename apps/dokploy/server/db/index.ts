import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
	var db: PostgresJsDatabase<typeof schema> | undefined;
}

const dbUrl =
	process.env.DATABASE_URL ||
	"postgres://dokploy:amukds4wi9001583845717ad2@dokploy-postgres:5432/dokploy";

export let db: PostgresJsDatabase<typeof schema>;
if (process.env.NODE_ENV === "production") {
	db = drizzle(postgres(dbUrl!), {
		schema,
	});
} else {
	if (!global.db)
		global.db = drizzle(postgres(dbUrl!), {
			schema,
		});

	db = global.db;
}
