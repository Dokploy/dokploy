import micromatch from "micromatch";

export const shouldDeploy = (
	watchPaths: string[] | null,
	modifiedFiles: string[],
): boolean => {
	if (!watchPaths || watchPaths?.length === 0) return true;
	return micromatch.some(modifiedFiles, watchPaths);
};
