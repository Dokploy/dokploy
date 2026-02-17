import { dbUrl } from "@dokploy/server/db/constants";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

declare global {
	var db: PostgresJsDatabase<typeof schema> | undefined;
}

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
