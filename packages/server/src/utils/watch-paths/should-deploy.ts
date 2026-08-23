import micromatch from "micromatch";

export const shouldDeploy = (
	watchPaths: string[] | null,
	modifiedFiles: (string | null | undefined)[] | null | undefined,
): boolean => {
	if (!watchPaths || watchPaths?.length === 0) return true;
	const files = (modifiedFiles ?? []).filter(
		(file): file is string => typeof file === "string",
	);
	return micromatch.some(files, watchPaths);
};
