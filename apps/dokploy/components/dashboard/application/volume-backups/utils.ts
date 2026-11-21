/**
 * Normalizes the raw "Keep Latest Backups" input into the value sent to the API.
 *
 * An empty input means "keep every backup", which has to be sent as an explicit
 * `null` so the column is cleared. Sending `undefined` instead would drop the
 * field from the update statement and silently keep the previous retention.
 *
 * A non-empty input with no parsed number is an invalid entry. The form rejects
 * it before submit, so this returns `undefined` to leave the stored retention
 * untouched rather than clearing it by accident.
 */
export const prepareKeepLatestCount = (
	rawInput: string,
	value?: number | null,
): number | null | undefined => {
	if (rawInput.trim() === "") {
		return null;
	}

	return value ?? undefined;
};
