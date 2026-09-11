import {
	checkGiteaUserRepositoryPermissions,
	createGiteaIssueComment,
	GITEA_WRITE_PERMISSIONS,
	giteaIssueCommentExists,
	listGiteaIssueComments,
	updateGiteaIssueComment,
} from "../utils/providers/gitea";
import { checkUserRepositoryPermissions } from "../utils/providers/github";
import {
	createIssueComment,
	createSecurityBlockedComment,
	findGithubById,
	getSecurityBlockedMessage,
	issueCommentExists,
	SECURITY_BLOCKED_COMMENT_MARKER,
	updateIssueComment,
} from "./github";
/**
 * Git providers that can host preview deployments. Preview deployments need to
 * read pull requests and write a status comment back to them, so a provider is
 * only usable once both capabilities exist.
 */
export type PreviewCommentProvider = "github" | "gitea";

export interface PreviewCommentContext {
	provider: PreviewCommentProvider;
	/** `githubId` or `giteaId` depending on `provider`. */
	providerId: string;
	owner: string;
	repository: string;
}

interface PreviewCommentApplication {
	sourceType: string;
	githubId?: string | null;
	owner?: string | null;
	repository?: string | null;
	giteaId?: string | null;
	giteaOwner?: string | null;
	giteaRepository?: string | null;
}

/**
 * Resolve the provider coordinates needed to comment on the pull request that
 * backs a preview deployment. Returns `null` for source types that cannot host
 * preview deployments (docker, custom git, gitlab, bitbucket, ...).
 */
export const getPreviewCommentContext = (
	application: PreviewCommentApplication,
): PreviewCommentContext | null => {
	if (
		application.sourceType === "github" &&
		application.githubId &&
		application.owner &&
		application.repository
	) {
		return {
			provider: "github",
			providerId: application.githubId,
			owner: application.owner,
			repository: application.repository,
		};
	}

	if (
		application.sourceType === "gitea" &&
		application.giteaId &&
		application.giteaOwner &&
		application.giteaRepository
	) {
		return {
			provider: "gitea",
			providerId: application.giteaId,
			owner: application.giteaOwner,
			repository: application.giteaRepository,
		};
	}

	return null;
};

export const previewCommentExists = async (
	context: PreviewCommentContext,
	commentId: string,
) => {
	const parsedCommentId = Number.parseInt(commentId);
	if (!commentId || Number.isNaN(parsedCommentId)) {
		return false;
	}

	if (context.provider === "gitea") {
		return await giteaIssueCommentExists({
			giteaId: context.providerId,
			owner: context.owner,
			repository: context.repository,
			commentId: parsedCommentId,
		});
	}

	return await issueCommentExists({
		owner: context.owner,
		repository: context.repository,
		comment_id: parsedCommentId,
		githubId: context.providerId,
	});
};

/**
 * Create the preview deployment comment on the pull request and return the
 * provider comment id as a string, matching the `pullRequestCommentId` column.
 */
export const createPreviewComment = async (
	context: PreviewCommentContext,
	{ issueNumber, body }: { issueNumber: string; body: string },
) => {
	if (context.provider === "gitea") {
		const comment = await createGiteaIssueComment({
			giteaId: context.providerId,
			owner: context.owner,
			repository: context.repository,
			index: issueNumber,
			body,
		});
		return `${comment.id}`;
	}

	const comment = await createIssueComment({
		owner: context.owner,
		repository: context.repository,
		issue_number: issueNumber,
		body,
		githubId: context.providerId,
	});
	return `${comment.id}`;
};

export const updatePreviewComment = async (
	context: PreviewCommentContext,
	{
		issueNumber,
		commentId,
		body,
	}: { issueNumber: string; commentId: string; body: string },
) => {
	if (context.provider === "gitea") {
		await updateGiteaIssueComment({
			giteaId: context.providerId,
			owner: context.owner,
			repository: context.repository,
			commentId,
			body,
		});
		return;
	}

	await updateIssueComment({
		owner: context.owner,
		repository: context.repository,
		issue_number: issueNumber,
		body,
		comment_id: Number.parseInt(commentId),
		githubId: context.providerId,
	});
};

/**
 * Make sure the preview deployment still has a comment to write status into:
 * users can delete it, in which case a fresh one is created. `created` tells
 * the caller whether `commentId` has to be persisted on the preview deployment.
 */
export const ensurePreviewComment = async (
	context: PreviewCommentContext,
	{
		issueNumber,
		commentId,
		body,
	}: { issueNumber: string; commentId: string; body: string },
): Promise<{ commentId: string; created: boolean }> => {
	if (await previewCommentExists(context, commentId)) {
		return { commentId, created: false };
	}

	return {
		commentId: await createPreviewComment(context, { issueNumber, body }),
		created: true,
	};
};

/**
 * Check whether the "deployment blocked" notice is already on the pull request,
 * so pushing more commits does not spam the thread.
 */
const hasExistingGiteaSecurityComment = async (
	context: PreviewCommentContext,
	prNumber: number,
) => {
	try {
		const comments = await listGiteaIssueComments({
			giteaId: context.providerId,
			owner: context.owner,
			repository: context.repository,
			index: prNumber,
		});
		return comments.some((comment) =>
			comment.body?.includes(SECURITY_BLOCKED_COMMENT_MARKER),
		);
	} catch (error) {
		console.error(
			`❌ Failed to check existing comments on PR #${prNumber}:`,
			error,
		);
		return false;
	}
};

export const createPreviewSecurityBlockedComment = async (
	context: PreviewCommentContext,
	{
		prNumber,
		prAuthor,
		permission,
	}: { prNumber: number; prAuthor: string; permission: string | null },
) => {
	if (context.provider === "gitea") {
		try {
			if (await hasExistingGiteaSecurityComment(context, prNumber)) {
				console.log(
					`ℹ️  Security notification comment already exists on PR #${prNumber}, skipping duplicate`,
				);
				return null;
			}

			return await createGiteaIssueComment({
				giteaId: context.providerId,
				owner: context.owner,
				repository: context.repository,
				index: prNumber,
				body: getSecurityBlockedMessage(
					prAuthor,
					context.repository,
					permission,
					GITEA_WRITE_PERMISSIONS.map((level) => `\`${level}\``).join(", "),
				),
			});
		} catch (error) {
			console.error(
				`❌ Failed to create security comment on PR #${prNumber}:`,
				error,
			);
			return null;
		}
	}

	return await createSecurityBlockedComment({
		owner: context.owner,
		repository: context.repository,
		prNumber,
		prAuthor,
		permission,
		githubId: context.providerId,
	});
};

/**
 * Verify that the pull request author is allowed to trigger a preview
 * deployment, i.e. that they have write access to the repository. Preview
 * deployments build and run pull request code on the Dokploy host, so an
 * unverifiable author is always treated as untrusted.
 */
export const checkPreviewAuthorPermissions = async (
	context: PreviewCommentContext,
	username: string,
): Promise<{
	hasWriteAccess: boolean;
	permission: string | null;
	verified: boolean;
}> => {
	if (context.provider === "gitea") {
		return await checkGiteaUserRepositoryPermissions(
			context.providerId,
			context.owner,
			context.repository,
			username,
		);
	}

	const githubProvider = await findGithubById(context.providerId);
	const result = await checkUserRepositoryPermissions(
		githubProvider,
		context.owner,
		context.repository,
		username,
	);

	return { ...result, verified: true };
};
