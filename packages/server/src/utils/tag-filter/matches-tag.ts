import micromatch from "micromatch";

export const matchesTag = (
	tagFilter: string | null | undefined,
	tagName: string,
): boolean => {
	if (!tagFilter) return true;
	return micromatch.isMatch(tagName, tagFilter);
};
