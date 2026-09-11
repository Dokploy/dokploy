import {
	checkPreviewAuthorPermissions,
	createPreviewDeployment,
	createPreviewSecurityBlockedComment,
	findPreviewDeploymentByApplicationId,
	findPreviewDeploymentsByPullRequestId,
	getPreviewCommentContext,
	IS_CLOUD,
	removePreviewDeployment,
} from "@dokploy/server";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";

/**
 * Gitea and Forgejo name some pull request actions differently than GitHub:
 * new commits arrive as `synchronized` rather than `synchronize`, and any label
 * change is `label_updated` (adding *or* removing a single label) while
 * `label_cleared` only fires when every label is removed at once.
 *
 * @link https://github.com/go-gitea/gitea/blob/main/modules/structs/hook.go
 */
const CREATE_ACTIONS = ["opened", "reopened", "synchronized", "label_updated"];

/**
 * Actions that refresh an existing preview but never create one - the GitHub
 * handler treats `unlabeled` the same way.
 */
const UPDATE_ONLY_ACTIONS = ["label_cleared"];

/**
 * Gitea serializes a user handle as `login` (`username` is only kept as a
 * backwards compatible alias), and handles are case insensitive.
 */
const getPayloadOwner = (repository: any): string | undefined =>
	repository?.owner?.login ??
	repository?.owner?.username ??
	repository?.owner?.name;

const sameHandle = (a?: string | null, b?: string | null) =>
	!!a && !!b && a.toLowerCase() === b.toLowerCase();

interface PreviewApplication {
	applicationId: string;
	name: string;
	sourceType: string;
	serverId: string | null;
	giteaId: string | null;
	giteaOwner: string | null;
	giteaRepository: string | null;
	giteaBranch: string | null;
	isPreviewDeploymentsActive: boolean | null;
	previewLabels: string[] | null;
	previewLimit: number | null;
	previewRequireCollaboratorPermissions: boolean | null;
	previewDeployments?: { previewDeploymentId: string }[];
}

interface HandlerResult {
	status: number;
	message: string;
}

/**
 * Handle a Gitea/Forgejo `pull_request` webhook event for a single application.
 *
 * Unlike GitHub - where one app installation webhook serves every repository -
 * the Gitea webhook is created per application (the URL carries the
 * application's refresh token), so the event is always scoped to `application`.
 */
export const handleGiteaPullRequestEvent = async ({
	application,
	body,
}: {
	application: PreviewApplication;
	body: any;
}): Promise<HandlerResult> => {
	const action = body?.action;
	const pullRequest = body?.pull_request;
	const pullRequestId = pullRequest?.id;

	if (!pullRequestId) {
		return {
			status: 400,
			message: "Pull request id missing in webhook payload",
		};
	}

	// The webhook URL identifies the application, not the repository, so the
	// payload has to be checked against the repository the application is
	// configured for. Without this, a webhook on any repository could deploy an
	// arbitrary branch of the configured one.
	const payloadRepository = body?.repository?.name;
	const payloadOwner = getPayloadOwner(body?.repository);

	if (
		!sameHandle(payloadRepository, application.giteaRepository) ||
		!sameHandle(payloadOwner, application.giteaOwner)
	) {
		return {
			status: 400,
			message:
				"Pull request repository does not match the repository configured for this application",
		};
	}

	if (action === "closed") {
		const previewDeploymentResult = await findPreviewDeploymentsByPullRequestId(
			`${pullRequestId}`,
		);

		let removed = 0;
		for (const previewDeployment of previewDeploymentResult) {
			// Pull request ids are only unique per Gitea instance, so never touch
			// previews that belong to another application.
			if (previewDeployment.applicationId !== application.applicationId) {
				continue;
			}
			try {
				await removePreviewDeployment(previewDeployment.previewDeploymentId);
				removed++;
			} catch (error) {
				console.error("Error removing preview deployment:", error);
			}
		}

		return {
			status: 200,
			message: `Preview Deployment Closed (${removed} removed)`,
		};
	}

	if (!application.isPreviewDeploymentsActive) {
		return {
			status: 200,
			message: "Preview deployments are disabled for this application",
		};
	}

	const isCreateAction = CREATE_ACTIONS.includes(action);

	if (!isCreateAction && !UPDATE_ONLY_ACTIONS.includes(action)) {
		return {
			status: 200,
			message: `Pull request action '${action}' does not trigger preview deployments`,
		};
	}

	const baseBranch = pullRequest?.base?.ref;
	if (!baseBranch || baseBranch !== application.giteaBranch) {
		return {
			status: 200,
			message: "Pull request does not target the configured branch",
		};
	}

	const prAuthor = pullRequest?.user?.login ?? pullRequest?.user?.username;
	if (!prAuthor) {
		console.warn(
			"⚠️ SECURITY: PR author information missing in webhook payload",
		);
		return { status: 400, message: "PR author information missing" };
	}

	const commentContext = getPreviewCommentContext(application);
	if (!commentContext) {
		return {
			status: 400,
			message:
				"Preview deployments require a Gitea provider with a repository and owner configured",
		};
	}

	const prNumber = pullRequest?.number;
	const repositorySlug = `${application.giteaOwner}/${application.giteaRepository}`;

	// `cloneGiteaRepository` always clones the configured repository, so a branch
	// that only exists in a fork can never be checked out. Bail out with a clear
	// message instead of producing a failing build.
	const headRepository = pullRequest?.head?.repo;
	if (
		headRepository &&
		(!sameHandle(headRepository?.name, application.giteaRepository) ||
			!sameHandle(getPayloadOwner(headRepository), application.giteaOwner))
	) {
		return {
			status: 200,
			message:
				"Preview deployments are not supported for pull requests from forks",
		};
	}

	// SECURITY: preview deployments build and run pull request code on the
	// Dokploy host, so only authors with write access may trigger them.
	if (application.previewRequireCollaboratorPermissions !== false) {
		// The repository owner always has admin access, and Gitea only answers
		// the permission endpoint for repository admins, so short circuit here.
		const isRepositoryOwner = sameHandle(prAuthor, application.giteaOwner);

		if (!isRepositoryOwner) {
			try {
				const { hasWriteAccess, permission, verified } =
					await checkPreviewAuthorPermissions(commentContext, prAuthor);

				if (!verified) {
					// Gitea refused to answer - this is a Dokploy side
					// misconfiguration, so do not blame the pull request author.
					console.error(
						`🚨 SECURITY: Could not verify permissions of ${prAuthor} on ${repositorySlug}; the Gitea account connected to Dokploy needs admin access on the repository. Skipping preview deployment for ${application.name}.`,
					);
					return {
						status: 200,
						message:
							"Preview deployment skipped: the Gitea account connected to Dokploy cannot read collaborator permissions for this repository",
					};
				}

				if (!hasWriteAccess) {
					console.warn(
						`🚨 SECURITY: Blocked preview deployment for ${application.name} from unauthorized user ${prAuthor} on ${repositorySlug}. Permission: ${permission || "none"}`,
					);
					await createPreviewSecurityBlockedComment(commentContext, {
						prNumber: Number.parseInt(`${prNumber}`),
						prAuthor,
						permission,
					});
					return {
						status: 200,
						message: "Preview deployment blocked: author lacks write access",
					};
				}

				console.log(
					`✅ SECURITY: Preview deployment authorized for ${application.name} from user ${prAuthor} on ${repositorySlug}. Permission: ${permission}`,
				);
			} catch (error) {
				console.error(
					`Error validating PR author permissions for ${application.name}:`,
					error,
				);
				return {
					status: 200,
					message:
						"Preview deployment blocked: author permissions unverifiable",
				};
			}
		}
	} else {
		console.warn(
			`⚠️  SECURITY: Preview deployment for ${application.name} allows deployment from any PR author (security check disabled)`,
		);
	}

	if (application.previewLabels && application.previewLabels.length > 0) {
		const labels: { name?: string }[] = pullRequest?.labels ?? [];
		const hasLabel = labels.some(
			(label) => label?.name && application.previewLabels?.includes(label.name),
		);

		if (!hasLabel) {
			return {
				status: 200,
				message: "Pull request does not carry any of the configured labels",
			};
		}
	}

	const previewDeploymentResult = await findPreviewDeploymentByApplicationId(
		application.applicationId,
		`${pullRequestId}`,
	);

	let previewDeploymentId = previewDeploymentResult?.previewDeploymentId ?? "";

	if (!previewDeploymentResult) {
		if (!isCreateAction) {
			return {
				status: 200,
				message: "No existing preview deployment to redeploy",
			};
		}

		// The limit only applies to new previews, existing ones must still be
		// redeployed when the pull request is updated.
		const previewLimit = application.previewLimit ?? 3;
		if ((application.previewDeployments?.length ?? 0) >= previewLimit) {
			console.warn(
				`⚠️ Preview deployment limit (${previewLimit}) reached for ${application.name}, skipping preview for pull request #${prNumber}`,
			);
			return {
				status: 200,
				message: `Preview deployment limit (${previewLimit}) reached`,
			};
		}

		const previewDeployment = await createPreviewDeployment({
			applicationId: application.applicationId,
			branch: pullRequest?.head?.ref,
			pullRequestId: `${pullRequestId}`,
			pullRequestNumber: `${prNumber}`,
			pullRequestTitle: pullRequest?.title,
			pullRequestURL: pullRequest?.html_url,
		});

		previewDeploymentId = previewDeployment.previewDeploymentId;
	}

	if (!previewDeploymentId) {
		return { status: 200, message: "No preview deployment to deploy" };
	}

	const jobData: DeploymentJob = {
		applicationId: application.applicationId,
		titleLog: "Preview Deployment",
		descriptionLog: `Hash: ${pullRequest?.head?.sha ?? ""}`,
		type: "deploy",
		applicationType: "application-preview",
		server: !!application.serverId,
		previewDeploymentId,
	};

	if (IS_CLOUD && application.serverId) {
		jobData.serverId = application.serverId;
		deploy(jobData).catch((error) => {
			console.error("Background deployment failed:", error);
		});
		return { status: 200, message: "Preview Deployment queued" };
	}

	await myQueue.add(
		"deployments",
		{ ...jobData },
		{
			removeOnComplete: true,
			removeOnFail: true,
		},
	);

	return { status: 200, message: "Preview Deployment queued" };
};
