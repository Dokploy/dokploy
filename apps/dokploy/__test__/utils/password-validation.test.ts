import { generateRandomPassword } from "@dokploy/server/auth/random-password";
import {
	apiCreateUserWithCredentials,
	apiUpdateUser,
} from "@dokploy/server/db/schema";
import {
	isWeakNewPassword,
	STRONG_PASSWORD_MESSAGE,
	STRONG_PASSWORD_REGEX,
} from "@dokploy/server/utils/password-validation";
import bcrypt from "bcrypt";
import { describe, expect, it } from "vitest";

const WEAK = "weakpass";
const STRONG = "Str0ng!Passw0rd";

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

describe("isWeakNewPassword", () => {
	const passwordSettingRequests = (password: string) =>
		[
			["/sign-up/email", { email: "a@example.com", password }],
			["/reset-password", { token: "token", newPassword: password }],
			["/change-password", { currentPassword: STRONG, newPassword: password }],
			["/admin/create-user", { email: "a@example.com", password }],
			["/admin/set-user-password", { userId: "user-1", newPassword: password }],
		] as const;

	it.each(passwordSettingRequests(WEAK))(
		"rejects a weak new password on %s",
		(path, body) => {
			expect(isWeakNewPassword(path, body)).toBe(true);
		},
	);

	it.each(passwordSettingRequests(STRONG))(
		"allows a strong new password on %s",
		(path, body) => {
			expect(isWeakNewPassword(path, body)).toBe(false);
		},
	);

	it("allows changing from a weak current password to a strong one", () => {
		expect(
			isWeakNewPassword("/change-password", {
				currentPassword: WEAK,
				newPassword: STRONG,
			}),
		).toBe(false);
	});

	it.each([
		["/sign-up/email", { password: WEAK, newPassword: STRONG }],
		["/admin/create-user", { password: WEAK, newPassword: STRONG }],
		["/reset-password", { newPassword: WEAK, password: STRONG }],
		["/change-password", { newPassword: WEAK, password: STRONG }],
		["/admin/set-user-password", { newPassword: WEAK, password: STRONG }],
	])("checks the field %s saves, not a strong decoy field", (path, body) => {
		expect(isWeakNewPassword(path, body)).toBe(true);
	});

	it("rejects a password that is not a string", () => {
		expect(isWeakNewPassword("/sign-up/email", { password: 12345678 })).toBe(
			true,
		);
	});

	it.each(["/sign-in/email", "/two-factor/enable", "/delete-user"])(
		"does not check an existing password on %s",
		(path) => {
			expect(isWeakNewPassword(path, { password: WEAK })).toBe(false);
		},
	);

	it("allows an admin to create a user without a password", () => {
		expect(
			isWeakNewPassword("/admin/create-user", {
				email: "a@example.com",
				name: "A",
			}),
		).toBe(false);
	});
});

describe("apiUpdateUser", () => {
	it("rejects a weak new password", () => {
		const result = apiUpdateUser.safeParse({
			currentPassword: STRONG,
			password: WEAK,
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(STRONG_PASSWORD_MESSAGE);
	});

	it("allows changing from a weak current password to a strong one", () => {
		expect(
			apiUpdateUser.safeParse({ currentPassword: WEAK, password: STRONG })
				.success,
		).toBe(true);
	});

	it("allows a profile update without a new password", () => {
		expect(
			apiUpdateUser.safeParse({ firstName: "Ada", lastName: "Lovelace" })
				.success,
		).toBe(true);
	});
});

describe("apiCreateUserWithCredentials", () => {
	const input = { email: "a@example.com", role: "member" };

	it("rejects a weak password", () => {
		const result = apiCreateUserWithCredentials.safeParse({
			...input,
			password: WEAK,
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.message).toBe(STRONG_PASSWORD_MESSAGE);
	});

	it("accepts a strong password", () => {
		expect(
			apiCreateUserWithCredentials.safeParse({ ...input, password: STRONG })
				.success,
		).toBe(true);
	});
});
