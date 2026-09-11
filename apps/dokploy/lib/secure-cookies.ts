export const isHttpsRequest = (
	forwardedProto: string | string[] | undefined,
): boolean => {
	if (!forwardedProto) return false;
	const value = Array.isArray(forwardedProto)
		? forwardedProto[0]
		: forwardedProto;
	// take the first value in case a proxy chain sent a list
	return value?.split(",")[0]?.trim().toLowerCase() === "https";
};

const hasSecureAttribute = (cookie: string): boolean =>
	/;\s*secure(?:\s*;|\s*$)/i.test(cookie);

const withSecure = (cookie: string): string =>
	hasSecureAttribute(cookie) ? cookie : `${cookie}; Secure`;

// Add Secure to a Set-Cookie header value (string or string[]).
export const secureSetCookie = (
	value: string | number | readonly string[],
): string | number | string[] => {
	if (typeof value === "number") return value;
	if (Array.isArray(value)) return value.map(withSecure);
	return withSecure(value as string);
};
