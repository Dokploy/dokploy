interface CommitLike {
	added?: Array<string | null | undefined> | null;
	modified?: Array<string | null | undefined> | null;
	removed?: Array<string | null | undefined> | null;
}

export const normalizeChangedFilesFromCommits = (
	commits: Array<CommitLike | null | undefined> | null | undefined,
): string[] => {
	return (commits || [])
		.flatMap((commit) => {
			if (!commit) {
				return [];
			}

			return [commit.added, commit.modified, commit.removed].flatMap(
				(paths) => paths || [],
			);
		})
		.filter((path): path is string => typeof path === "string" && path.length > 0);
};
