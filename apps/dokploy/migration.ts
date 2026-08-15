import { dbUrl } from "@dokploy/server/db";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const sql = postgres(dbUrl, { max: 1 });
const db = drizzle(sql);

await migrate(db, { migrationsFolder: "drizzle" })
	.then(() => {
		console.log("Migration complete");
	})
	.catch((error) => {
		console.error(
			"Migration failed:",
			error,
			"\n\nThe database schema is out of sync with the application, so the server will NOT start",
			"to avoid running against an incomplete schema.",
			"\n- Local development: reset the dev database with `just db-reset` and run `just dev` again.",
			"\n- Production: restart the dokploy service so migrations retry, or restore from a backup.",
		);
		process.exit(1);
	})
	.finally(() => {
		sql.end();
	});
