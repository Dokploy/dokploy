/**
 * Preview-deployment access control for GitHub pull requests.
 *
 * Security ordering (issue #4902): the preview-label filter is itself a valid
 * gate — only collaborators with write access can add labels to a PR — so it
 * MUST run before the collaborator-permission check. A PR that does not carry a
 * configured preview label is not a deployment candidate and is dropped
 * silently: no GitHub API call, no deployment, and no "Preview Deployment
 * Blocked" comment. Checking permissions first raised false-positive security
 * alarms on PRs that were never going to deploy (e.g. dependency-bot PRs).
 */

export interface PreviewCandidateApp {
	name: string;
	previewLabels?: string[] | null;
	previewRequireCollaboratorPermissions?: boolean | null;
}

export interface PullRequestLabel {
	name: string;
}

export interface CollaboratorPermission {
	hasWriteAccess: boolean;
	permission: string | null;
}

/**
 * A non-empty label list is a gate: the PR must carry at least one of the
 * labels. An app with no configured labels deploys a preview for every PR.
 */
export const pullRequestMatchesPreviewLabels = (
	configuredLabels: string[] | null | undefined,
	pullRequestLabels: PullRequestLabel[] | null | undefined,
): boolean => {
	if (!configuredLabels || configuredLabels.length === 0) {
		return true;
	}
	return (pullRequestLabels ?? []).some((label) =>
		configuredLabels.includes(label.name),
	);
};

export interface PreviewAccessDecision<T> {
	/** Apps cleared to deploy a preview for this PR. */
	authorizedApps: T[];
	/** Names of apps blocked because the PR author lacks write access. */
	blockedAppNames: string[];
	/** The PR author's resolved permission level, for the security comment. */
	authorPermission: string | null;
}

/**
 * Splits preview-enabled apps into those cleared to deploy and those blocked by
 * the collaborator-permission check.
 *
 * `resolveAuthorPermission` (a GitHub API call) is invoked only for apps whose
 * labels match the PR, so label-mismatched apps never trigger a permission
 * check and never appear in `blockedAppNames`. The check fails closed: any
 * error blocks the app rather than deploying it.
 *
 * Every app produces exactly one greppable decision log — ACCEPTED, BLOCKED, or
 * SKIPPED — carrying the PR context, so an operator can always trace why a
 * given PR event did or did not deploy a preview.
 */
export const partitionPreviewApps = async <T extends PreviewCandidateApp>({
	apps,
	pullRequestLabels,
	owner,
	repository,
	prAuthor,
	prNumber,
	action,
	resolveAuthorPermission,
}: {
	apps: T[];
	pullRequestLabels: PullRequestLabel[] | null | undefined;
	owner: string;
	repository: string;
	prAuthor: string;
	prNumber: number | string;
	action: string;
	resolveAuthorPermission: (app: T) => Promise<CollaboratorPermission>;
}): Promise<PreviewAccessDecision<T>> => {
	const authorizedApps: T[] = [];
	const blockedAppNames: string[] = [];
	let authorPermission: string | null = null;

	// Shared prefix so every decision line is traceable to this PR event.
	const pr = `PR #${prNumber} (${action}) by ${prAuthor} on ${owner}/${repository}`;
	const prLabelNames = (pullRequestLabels ?? []).map((label) => label.name);

	for (const app of apps) {
		// Gate 1 — labels. A mismatch is a routine skip, not a security block.
		if (
			!pullRequestMatchesPreviewLabels(app.previewLabels, pullRequestLabels)
		) {
			console.log(
				`⏭️  Preview SKIPPED for "${app.name}" — ${pr}: PR labels [${prLabelNames.join(", ")}] do not match required [${(app.previewLabels ?? []).join(", ")}]`,
			);
			continue;
		}

		// Opt-out defaults to enabled, so `undefined` still enforces the check.
		if (app.previewRequireCollaboratorPermissions === false) {
			console.warn(
				`⚠️  SECURITY: Preview ACCEPTED for "${app.name}" — ${pr}: collaborator permission check disabled (any author allowed)`,
			);
			authorizedApps.push(app);
			continue;
		}

		// Gate 2 — collaborator permissions (fail closed).
		try {
			const { hasWriteAccess, permission } = await resolveAuthorPermission(app);
			authorPermission = permission;

			if (!hasWriteAccess) {
				console.warn(
					`🚨 SECURITY: Preview BLOCKED for "${app.name}" — ${pr}: author lacks write access (permission: ${permission || "none"})`,
				);
				blockedAppNames.push(app.name);
				continue;
			}

			console.log(
				`✅ SECURITY: Preview ACCEPTED for "${app.name}" — ${pr}: author has write access (permission: ${permission})`,
			);
			authorizedApps.push(app);
		} catch (error) {
			console.error(
				`🚨 SECURITY: Preview BLOCKED for "${app.name}" — ${pr}: permission check failed (blocked fail-closed)`,
				error,
			);
			blockedAppNames.push(app.name);
		}
	}

	return { authorizedApps, blockedAppNames, authorPermission };
};
