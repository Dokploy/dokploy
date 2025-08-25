import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;

const pg = postgres(connectionString, { max: 1 });
const _db = drizzle(pg);

async function seed() {
	console.log("> Seed:", process.env.DATABASE_PATH, "\n");

	// const authenticationR = await db
	// 	.insert(users)
	// 	.values([
	// 		{
	// 			email: "user1@hotmail.com",
	// 			password: password("12345671"),
	// 		},
	// 	])
	// 	.onConflictDoNothing()
	// 	.returning();

	// console.log("\nSemillas Update:", authenticationR.length);
}

seed().catch((e) => {
	console.error(e);
	process.exit(1);
});
