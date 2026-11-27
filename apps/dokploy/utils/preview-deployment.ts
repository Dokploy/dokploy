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
	authorizedApps: T[];
	blockedAppNames: string[];
	authorPermission: string | null;
}

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

	const pr = `PR #${prNumber} (${action}) by ${prAuthor} on ${owner}/${repository}`;
	const prLabelNames = (pullRequestLabels ?? []).map((label) => label.name);

	for (const app of apps) {
		if (
			!pullRequestMatchesPreviewLabels(app.previewLabels, pullRequestLabels)
		) {
			console.log(
				`⏭️  Preview SKIPPED for "${app.name}" — ${pr}: PR labels [${prLabelNames.join(", ")}] do not match required [${(app.previewLabels ?? []).join(", ")}]`,
			);
			continue;
		}

		if (app.previewRequireCollaboratorPermissions === false) {
			console.warn(
				`⚠️  SECURITY: Preview ACCEPTED for "${app.name}" — ${pr}: collaborator permission check disabled (any author allowed)`,
			);
			authorizedApps.push(app);
			continue;
		}

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
