import { generateRandomPassword } from "@dokploy/server/dist/auth/random-password";
import { findAdmin } from "@dokploy/server/dist/services/admin";
import { updateAuthById } from "@dokploy/server/dist/services/auth";

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
		console.log("Error to reset password", error);
	}
})();
