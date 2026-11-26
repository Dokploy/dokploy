interface ApiErrorLike {
	message?: string;
	data?: {
		zodError?: {
			formErrors?: string[];
			fieldErrors?: Record<string, string[] | undefined>;
		} | null;
	} | null;
}

// An input validation error's message is the raw JSON issue list; the API's
// error formatter also attaches the flattened issues, which read as sentences.
export const readableErrorMessage = (error: unknown, fallback: string) => {
	const { message, data } = (error ?? {}) as ApiErrorLike;
	const zodError = data?.zodError;
	if (zodError) {
		return (
			zodError.formErrors?.[0] ??
			Object.values(zodError.fieldErrors ?? {}).flat()[0] ??
			fallback
		);
	}
	return message || fallback;
};
