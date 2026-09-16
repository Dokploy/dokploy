/** Match the entire tag, treating only * as a wildcard (zero or more characters). */
export function matchesTagPattern(tag: string, pattern: string): boolean {
	const parts = pattern.split("*");
	const prefix = parts[0] ?? "";
	if (parts.length === 1) return tag === prefix;
	if (!tag.startsWith(prefix)) return false;

	let offset = prefix.length;
	for (const part of parts.slice(1, -1)) {
		const index = tag.indexOf(part, offset);
		if (index === -1) return false;
		offset = index + part.length;
	}
	const suffix = parts[parts.length - 1] ?? "";
	return tag.endsWith(suffix) && tag.length - suffix.length >= offset;
}

export function matchesTriggerTags(
	tag: string,
	patterns?: string[] | null,
): boolean {
	return (
		!patterns?.length ||
		patterns.some((pattern) => matchesTagPattern(tag, pattern))
	);
}
