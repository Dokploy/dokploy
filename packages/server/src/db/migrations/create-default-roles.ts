import { sql } from "drizzle-orm";
import { db } from "..";
import { organization } from "../schema/account";
import { getDefaultRolesSQL } from "../schema/rbac";

export async function createDefaultRoles() {
	try {
		// Get all organizations
		const organizations = await db.select().from(organization);

		// Create default roles for each organization
		for (const org of organizations) {
			const rolesSQL = getDefaultRolesSQL(org.id);
			await db.execute(sql.raw(rolesSQL));

			console.log(
				`Created default roles for organization: ${org.name} (${org.id})`,
			);
		}

		console.log("Successfully created default roles for all organizations");
	} catch (error) {
		console.error("Error creating default roles:", error);
		throw error;
	}
}
