import { findAdmin } from "@dokploy/server";
import { updateAuthById } from "@dokploy/server";
import { generateRandomPassword } from "@dokploy/server";

(async () => {
	try {
		const randomPassword = await generateRandomPassword();

		const result = await findAdmin();

		const update = await updateAuthById(result.authId, {
			password: randomPassword.hashedPassword,
		});

		if (update) {
			console.log("Password reset successful");
			console.log("New password: ", randomPassword.randomPassword);
		} else {
			console.log("Password reset failed");
		}

		process.exit(0);
	} catch (error) {
		console.log("Error resetting password", error);
	}
})();
