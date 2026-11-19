export const STRONG_PASSWORD_REGEX =
	/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const STRONG_PASSWORD_MESSAGE =
	"Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character";

const NEW_PASSWORD_FIELD_BY_PATH = new Map([
	["/sign-up/email", "password"],
	["/admin/create-user", "password"],
	["/reset-password", "newPassword"],
	["/change-password", "newPassword"],
	["/admin/set-user-password", "newPassword"],
]);

export const isWeakNewPassword = (path: string, body: unknown) => {
	const field = NEW_PASSWORD_FIELD_BY_PATH.get(path);
	if (!field) {
		return false;
	}
	const value = (body as Record<string, unknown> | undefined)?.[field];
	return (
		value !== undefined &&
		(typeof value !== "string" || !STRONG_PASSWORD_REGEX.test(value))
	);
};
