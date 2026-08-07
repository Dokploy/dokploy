/**
 * Decide the `keepLatestCount` value to persist for a volume backup.
 *
 * An empty input means "keep unlimited backups", which must be written as
 * `null` rather than `undefined`. The backend update uses drizzle's `.set()`,
 * which silently omits `undefined` keys — so sending `undefined` would leave a
 * previously configured limit untouched and make it impossible to turn the
 * limit off again (see #4184).
 */
export const prepareKeepLatestCount = (
	rawInput: string,
	formValue: number | null | undefined,
): number | null => {
	if (rawInput.trim() === "") {
		return null;
	}
	return formValue ?? null;
};
