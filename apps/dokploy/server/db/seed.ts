import bc from "bcrypt";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { users } from "./schema";

const connectionString = process.env.DATABASE_URL!;

const pg = postgres(connectionString, { max: 1 });
const db = drizzle(pg);

function password(txt: string) {
	return bc.hashSync(txt, 10);
}

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
