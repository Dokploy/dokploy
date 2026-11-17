export const STRONG_PASSWORD_REGEX =
	/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const STRONG_PASSWORD_MESSAGE =
	"Password must be at least 8 characters and include an uppercase letter, a lowercase letter, a number and a special character";
