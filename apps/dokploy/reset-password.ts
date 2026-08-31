import { findOwner, generateRandomPassword } from "@dokploy/server";
import { db } from "@dokploy/server/db";
import { account, user } from "@dokploy/server/db/schema";
import { and, eq } from "drizzle-orm";

(async () => {
	try {
		const email = process.argv[2]?.trim().toLowerCase();

		const randomPassword = await generateRandomPassword();

		let userId: string;

		if (email) {
			const foundUser = await db.query.user.findFirst({
				where: eq(user.email, email),
			});

			if (!foundUser) {
				console.log(`User not found for email: ${email}`);
				process.exit(1);
			}

			userId = foundUser.id;
		} else {
			const owner = await findOwner();
			userId = owner.userId;
		}

		const update = await db
			.update(account)
			.set({
				password: randomPassword.hashedPassword,
			})
			.where(
				and(eq(account.userId, userId), eq(account.providerId, "credential")),
			);

		if (update.count > 0) {
			console.log("Password reset successful");
			console.log("New password: ", randomPassword.randomPassword);
		} else {
			console.log(
				"Password reset failed: no credential account found for this user",
			);
			process.exit(1);
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting password", error);
		process.exit(1);
	}
})();
