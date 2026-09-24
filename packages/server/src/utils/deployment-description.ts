/** Retain webhook metadata when the checked-out commit becomes available. */
export const getDeploymentCommitDescription = (
	description: string,
	commitHash: string,
): string => {
	const metadata = description.trim();
	const commit = `Commit: ${commitHash}`;
	// Older push webhooks use Hash; avoid showing the same commit twice.
	if (!metadata || metadata === `Hash: ${commitHash}` || metadata === commit) {
		return commit;
	}
	return `${metadata}\n${commit}`;
};
