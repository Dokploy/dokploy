import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { dbUrl } from "./constants";
import * as schema from "./schema";
import { sanitizeDbUrl } from "./utils";

declare global {
  var db: PostgresJsDatabase<typeof schema> | undefined;
}

function getDbInstance(): PostgresJsDatabase<typeof schema> {
  if (process.env.NODE_ENV === "production") {
    // Log database connection for debugging in non-production or when DEBUG is set
    if (process.env.DEBUG) {
    console.log(`[RUNTIME] Connecting to database: ${sanitizeDbUrl(dbUrl)}`);
    }
    return drizzle(postgres(dbUrl), { schema });
  }
  if (!global.db) {
    if (process.env.DEBUG || process.env.NODE_ENV !== "production") {
      console.log(`[RUNTIME] Connecting to database: ${sanitizeDbUrl(dbUrl)}`);
    }
    global.db = drizzle(postgres(dbUrl), { schema });
  }
  return global.db;
}

export const db: PostgresJsDatabase<typeof schema> = getDbInstance();
export { dbUrl };
