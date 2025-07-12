import { findOwner } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { users } from "@dokploy/server/db/schema";
import { eq } from "drizzle-orm";

(async () => {
	try {
		const result = await findOwner();

		const update = await db
			.update(users)
			.set({
				twoFactorEnabled: false,
			})
			.where(eq(users.id, result.userId));

		if (update) {
			console.log("2FA reset successful");
		} else {
			console.log("Password reset failed");
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting 2FA", error);
	}
})();
