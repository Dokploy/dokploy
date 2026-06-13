export const apiKeyPrefixRegex = /^[A-Za-z0-9_-]+$/;
export const apiKeyPrefixErrorMessage =
	"Prefix can only contain ASCII letters, numbers, underscores, and hyphens";

const defaultCreateApiKeyErrorMessage = "Failed to generate API key";

const getErrorMessage = (error: unknown) => {
	if (
		typeof error === "object" &&
		error !== null &&
		"message" in error &&
		typeof error.message === "string"
	) {
		return error.message;
	}
};

export const getCreateApiKeyPrefixError = (error: unknown) => {
	if (typeof error !== "object" || error === null) {
		return;
	}

	const prefixFieldErrors = (
		error as {
			data?: {
				zodError?: {
					fieldErrors?: {
						prefix?: string[];
					};
				};
			};
		}
	).data?.zodError?.fieldErrors?.prefix;

	if (prefixFieldErrors?.[0]) {
		return prefixFieldErrors[0];
	}

	const message = getErrorMessage(error);
	if (message === apiKeyPrefixErrorMessage) {
		return message;
	}
};

export const getCreateApiKeyErrorMessage = (error: unknown) => {
	return (
		getCreateApiKeyPrefixError(error) ??
		getErrorMessage(error) ??
		defaultCreateApiKeyErrorMessage
	);
};
