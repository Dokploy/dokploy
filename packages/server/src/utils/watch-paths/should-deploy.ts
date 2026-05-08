import micromatch from "micromatch";

export const shouldDeploy = (
	watchPaths: string[] | null,
	modifiedFiles: Array<string | null | undefined> | null | undefined,
): boolean => {
	if (!watchPaths || watchPaths?.length === 0) return true;
	const normalizedModifiedFiles = (modifiedFiles || []).filter(
		(path): path is string => typeof path === "string" && path.length > 0,
	);

	if (normalizedModifiedFiles.length === 0) {
		return false;
	}

	return micromatch.some(normalizedModifiedFiles, watchPaths);
};
