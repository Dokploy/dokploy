const DEFAULT_PASSWORD_LENGTH = 20;
const DEFAULT_PASSWORD_CHARSET =
	"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export const generateRandomPassword = (
	length: number = DEFAULT_PASSWORD_LENGTH,
	charset: string = DEFAULT_PASSWORD_CHARSET,
) => {
	const safeLength =
		Number.isFinite(length) && length > 0
			? Math.floor(length)
			: DEFAULT_PASSWORD_LENGTH;

	if (safeLength <= 0 || charset.length === 0) {
		return "";
	}

	const cryptoApi =
		typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

	if (!cryptoApi?.getRandomValues) {
		throw new Error(
			"crypto.getRandomValues is not available. Secure random password generation requires a cryptographically secure random number generator.",
		);
	}

	const values = new Uint32Array(safeLength);
	cryptoApi.getRandomValues(values);

	let result = "";
	for (const value of values) {
		result += charset[value % charset.length];
	}

	return result;
};
