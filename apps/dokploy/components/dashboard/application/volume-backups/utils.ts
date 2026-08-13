/**
 * Normalizes the raw "Keep Latest Backups" input into the value sent to the API.
 *
 * An empty input means "keep every backup", which has to be sent as an explicit
 * `null` so the column is cleared. Sending `undefined` instead would drop the
 * field from the update statement and silently keep the previous retention.
 */
export const prepareKeepLatestCount = (
	rawInput: string,
	value?: number | null,
): number | null => {
	if (rawInput.trim() === "") {
		return null;
	}

	return value ?? null;
};
