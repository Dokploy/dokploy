export const isValidApiKey = (
	configuredKey: string | undefined,
	authHeader: string | undefined,
) => {
	const hasConfiguredKey =
		typeof configuredKey === "string" && configuredKey.trim().length > 0;
	const hasAuthHeader =
		typeof authHeader === "string" && authHeader.trim().length > 0;

	return hasConfiguredKey && hasAuthHeader && configuredKey === authHeader;
};
