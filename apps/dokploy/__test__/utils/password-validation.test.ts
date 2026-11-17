import { generateRandomPassword } from "@dokploy/server/auth/random-password";
import { STRONG_PASSWORD_REGEX } from "@dokploy/server/utils/password-validation";
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";

describe("STRONG_PASSWORD_REGEX", () => {
	it.each(["Passw0rd!", "C0rrect-Horse-Battery", "aB3$aB3$"])(
		"accepts strong password %s",
		(password) => {
			expect(STRONG_PASSWORD_REGEX.test(password)).toBe(true);
		},
	);

	it.each([
		"",
		"Pa0!",
		"Passw0r",
		"password1!",
		"PASSWORD1!",
		"Password!!",
		"Password12",
		"12345678",
	])("rejects weak password %s", (password) => {
		expect(STRONG_PASSWORD_REGEX.test(password)).toBe(false);
	});
});

describe("generateRandomPassword", () => {
	it("generates passwords that meet the strong password rule", async () => {
		for (let i = 0; i < 20; i++) {
			const { randomPassword } = await generateRandomPassword();
			expect(randomPassword).toHaveLength(16);
			expect(STRONG_PASSWORD_REGEX.test(randomPassword)).toBe(true);
		}
	});

	it("returns a bcrypt hash of the generated password", async () => {
		const { randomPassword, hashedPassword } = await generateRandomPassword();
		expect(await bcrypt.compare(randomPassword, hashedPassword)).toBe(true);
	});
});
