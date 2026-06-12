// Profiles must match docker compose's identifier rules (alphanumerics plus
// `_` `-`); anything else risks being parsed as a flag and broken into bash.
export const VALID_COMPOSE_PROFILE_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

export const sanitizeComposeProfiles = (
	profiles: ReadonlyArray<string> | null | undefined,
): string[] => {
	if (!profiles?.length) return [];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const raw of profiles) {
		const trimmed = raw?.trim();
		if (
			!trimmed ||
			!VALID_COMPOSE_PROFILE_REGEX.test(trimmed) ||
			seen.has(trimmed)
		) {
			continue;
		}
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
};
