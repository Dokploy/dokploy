import semver from "semver";

export const isVersionAtLeast = (
	currentVersion: string,
	targetVersion: string,
) => {
	const current = semver.clean(currentVersion);
	const target = semver.clean(targetVersion);

	return Boolean(current && target && semver.gte(current, target));
};
