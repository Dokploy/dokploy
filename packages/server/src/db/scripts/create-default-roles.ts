import { createDefaultRoles } from "../migrations/create-default-roles";

async function main() {
	try {
		await createDefaultRoles();
		process.exit(0);
	} catch (error) {
		console.error("Failed to create default roles:", error);
		process.exit(1);
	}
}

main();
