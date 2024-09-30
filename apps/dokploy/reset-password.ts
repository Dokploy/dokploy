import { findAdmin } from "@dokploy/builders";
import { updateAuthById } from "@dokploy/builders";
import { generateRandomPassword } from "@dokploy/builders";

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
