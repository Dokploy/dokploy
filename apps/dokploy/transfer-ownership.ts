import {
	getInstanceOwnerId,
	transferInstanceOwnership,
	updateWebServerSettings,
	userEmailEquals,
} from "@dokploy/server";
import { db } from "@dokploy/server/db";

(async () => {
	try {
		const email = process.argv[2]?.trim().toLowerCase();

		if (!email) {
			console.log("Usage: pnpm run transfer-ownership <new-owner-email>");
			process.exit(1);
		}

		const newOwner = await db.query.user.findFirst({
			where: userEmailEquals(email),
			columns: { id: true, banned: true },
		});

		if (!newOwner) {
			console.log(`User not found for email: ${email}`);
			process.exit(1);
		}

		if (newOwner.banned) {
			console.log(`User ${email} is deactivated and cannot sign in`);
			process.exit(1);
		}

		const currentOwnerId = await getInstanceOwnerId();

		if (currentOwnerId === newOwner.id) {
			console.log(`${email} already owns this instance`);
			process.exit(0);
		}

		if (!currentOwnerId) {
			await updateWebServerSettings({ instanceOwnerId: newOwner.id });
			console.log(`${email} is now the instance owner`);
			process.exit(0);
		}

		const { organizationsTransferred } = await transferInstanceOwnership(
			currentOwnerId,
			newOwner.id,
		);

		console.log(
			`Ownership transferred to ${email} (${organizationsTransferred} organizations)`,
		);
		process.exit(0);
	} catch (error) {
		console.log("Error transferring ownership", error);
		process.exit(1);
	}
})();
