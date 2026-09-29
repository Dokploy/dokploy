import micromatch from "micromatch";

export const matchesTriggerTags = (
	tag: string,
	patterns?: string[] | null,
): boolean =>
	!patterns?.length || micromatch.isMatch(tag, patterns, { bash: true });
