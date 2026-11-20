import { randomInt } from "node:crypto";
import bcrypt from "bcrypt";
import { STRONG_PASSWORD_REGEX } from "../utils/password-validation";

const PASSWORD_LENGTH = 16;
const PASSWORD_CHARACTERS =
	"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#%^&*-_=+";

export const generateRandomPassword = async () => {
	let randomPassword = "";
	do {
		randomPassword = Array.from(
			{ length: PASSWORD_LENGTH },
			() => PASSWORD_CHARACTERS[randomInt(PASSWORD_CHARACTERS.length)],
		).join("");
	} while (!STRONG_PASSWORD_REGEX.test(randomPassword));

	const hashedPassword = await bcrypt.hash(randomPassword, 10);
	return { randomPassword, hashedPassword };
};
