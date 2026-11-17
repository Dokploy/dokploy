export const STRONG_PASSWORD_REGEX =
	/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const STRONG_PASSWORD_MESSAGE =
	"Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character";

const PASSWORD_SETTING_PATHS = [
	"/sign-up/email",
	"/reset-password",
	"/change-password",
	"/admin/create-user",
	"/admin/set-user-password",
];

export const isWeakNewPassword = (path: string, body: unknown) => {
	if (!PASSWORD_SETTING_PATHS.includes(path)) {
		return false;
	}
	const { password, newPassword } = (body ?? {}) as {
		password?: string;
		newPassword?: string;
	};
	const value = newPassword ?? password;
	return value !== undefined && !STRONG_PASSWORD_REGEX.test(value);
};
