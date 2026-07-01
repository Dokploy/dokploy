import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";

export const generateRandomPassword = async () => {
	const passwordLength = 16;

	const characters =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

	let randomPassword = "";
	for (let i = 0; i < passwordLength; i++) {
		randomPassword += characters.charAt(randomInt(characters.length));
	}

	const saltRounds = 10;

	const hashedPassword = await bcrypt.hash(randomPassword, saltRounds);
	return { randomPassword, hashedPassword };
};
