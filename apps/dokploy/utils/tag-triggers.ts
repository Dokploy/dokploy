import micromatch from "micromatch";

/** Match the entire tag, treating only * as a wildcard (zero or more characters). */
export function matchesTagPattern(tag: string, pattern: string): boolean {
	// Keep non-star glob syntax literal to preserve the existing tag filter contract.
	const glob = pattern.replace(/[\\?[\]{}()!+@|^$"]/g, "\\$&");
	return micromatch.isMatch(tag, glob, {
		bash: true, // A star can match slashes in Git tag names.
		dot: true,
		nonegate: true,
	});
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
