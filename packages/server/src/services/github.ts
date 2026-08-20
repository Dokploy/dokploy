import { db } from "@dokploy/server/db";
import {
	type apiCreateGithub,
	github,
	gitProvider,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { authGithub } from "../utils/providers/github";

export type Github = typeof github.$inferSelect;
export const createGithub = async (
	input: z.infer<typeof apiCreateGithub>,
	organizationId: string,
	userId: string,
) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "github",
				organizationId: organizationId,
				name: input.name,
				userId: userId,
			})
			.returning()
			.then((response) => response[0]);

		if (!newGitProvider) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: "Error creating the Git provider",
			});
		}

		return await tx
			.insert(github)
			.values({
				...input,
				gitProviderId: newGitProvider?.gitProviderId,
			})
			.returning()
			.then((response) => response[0]);
	});
};

export const findGithubById = async (githubId: string) => {
	const githubProviderResult = await db.query.github.findFirst({
		where: eq(github.githubId, githubId),
		with: {
			gitProvider: true,
		},
	});

	if (!githubProviderResult) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Github Provider not found",
		});
	}

	return githubProviderResult;
};

export const updateGithub = async (
	githubId: string,
	input: Partial<Github>,
) => {
	return await db
		.update(github)
		.set({
			...input,
		})
		.where(eq(github.githubId, githubId))
		.returning()
		.then((response) => response[0]);
};

export const getIssueComment = (
	appName: string,
	status: "success" | "error" | "running" | "initializing",
	previewDomain: string,
) => {
	let statusMessage = "";
	if (status === "success") {
		statusMessage = "✅ Done";
	} else if (status === "error") {
		statusMessage = "❌ Failed";
	} else if (status === "initializing") {
		statusMessage = "🔄 Building";
	} else {
		statusMessage = "🔄 Building";
	}
	const finished = `
| Name       | Status       | Preview                             | Updated (UTC)         |
|------------|--------------|-------------------------------------|-----------------------|
| ${appName}  | ${statusMessage} | [Preview URL](${previewDomain}) | ${new Date().toISOString()} |
`;

	return finished;
};
interface CommentExists {
	owner: string;
	repository: string;
	comment_id: number;
	githubId: string;
}
export const issueCommentExists = async ({
	owner,
	repository,
	comment_id,
	githubId,
}: CommentExists) => {
	const github = await findGithubById(githubId);
	const octokit = authGithub(github);
	try {
		await octokit.rest.issues.getComment({
			owner: owner || "",
			repo: repository || "",
			comment_id: comment_id,
		});
		return true;
	} catch {
		return false;
	}
};
interface Comment {
	owner: string;
	repository: string;
	issue_number: string;
	body: string;
	comment_id: number;
	githubId: string;
}
export const updateIssueComment = async ({
	owner,
	repository,
	issue_number,
	body,
	comment_id,
	githubId,
}: Comment) => {
	const github = await findGithubById(githubId);
	const octokit = authGithub(github);

	await octokit.rest.issues.updateComment({
		owner: owner || "",
		repo: repository || "",
		issue_number: issue_number,
		body,
		comment_id: comment_id,
	});
};

interface IssueCommentCreate {
	owner: string;
	repository: string;
	issue_number: string;
	body: string;
	githubId: string;
}

/**
 * Create a comment on a GitHub issue or pull request and return it, so callers
 * decide themselves what to do with the comment id.
 */
export const createIssueComment = async ({
	owner,
	repository,
	issue_number,
	body,
	githubId,
}: IssueCommentCreate) => {
	const github = await findGithubById(githubId);
	const octokit = authGithub(github);

	const issue = await octokit.rest.issues.createComment({
		owner: owner || "",
		repo: repository || "",
		issue_number: Number.parseInt(issue_number),
		body,
	});

	return issue.data;
};

/**
 * Marker used to detect an already-posted "deployment blocked" notice, so
 * subsequent pushes to the same pull request do not spam the thread.
 */
export const SECURITY_BLOCKED_COMMENT_MARKER =
	"🚨 Preview Deployment Blocked - Security Protection";

/**
 * Generate security notification message for blocked PR deployments
 */
export const getSecurityBlockedMessage = (
	prAuthor: string,
	repositoryName: string,
	permission: string | null,
	/**
	 * Access levels that would unblock the author. Gitea has no `maintain`
	 * level, so providers pass their own list.
	 */
	requiredLevels = "`write`, `maintain`, or `admin`",
) => {
	return `### ${SECURITY_BLOCKED_COMMENT_MARKER}

**Your pull request was blocked from triggering preview deployments**

#### Why was this blocked?
- **User**: \`${prAuthor}\`
- **Repository**: \`${repositoryName}\`
- **Permission Level**: \`${permission || "none"}\`
- **Required Level**: ${requiredLevels}

#### How to resolve this:

**Option 1: Get Collaborator Access (Recommended)**
Ask a repository maintainer to invite you as a collaborator with **write permissions** or higher.

**Option 2: Request Permission Override**
Ask a repository administrator to disable security validation for this specific application if appropriate.

#### For Repository Administrators:
To disable this security check (⚠️ **not recommended for public repositories**):
Enter to preview settings and disable the security check.

---
*This security measure protects against malicious code execution in preview deployments. Only trusted collaborators should have the ability to trigger deployments.*

<details>
<summary>🛡️ Learn more about this security feature</summary>

This protection prevents unauthorized users from:
- Executing malicious code on the deployment server
- Accessing environment variables and secrets
- Potentially compromising the infrastructure

Preview deployments are powerful but require trust. Only users with repository write access can trigger them.
</details>`;
};

/**
 * Check if a security notification comment already exists on a GitHub PR
 * This prevents creating duplicate security comments on subsequent pushes
 */
export const hasExistingSecurityComment = async ({
	owner,
	repository,
	prNumber,
	githubId,
}: {
	owner: string;
	repository: string;
	prNumber: number;
	githubId: string;
}): Promise<boolean> => {
	try {
		const github = await findGithubById(githubId);
		const octokit = authGithub(github);

		// Get all comments for this PR
		const { data: comments } = await octokit.rest.issues.listComments({
			owner,
			repo: repository,
			issue_number: prNumber,
		});

		// Check if any comment contains our security notification marker
		const securityCommentExists = comments.some((comment) =>
			comment.body?.includes(SECURITY_BLOCKED_COMMENT_MARKER),
		);

		return securityCommentExists;
	} catch (error) {
		console.error(
			`❌ Failed to check existing comments on PR #${prNumber}:`,
			error,
		);
		// If we can't check, assume no comment exists to avoid blocking functionality
		return false;
	}
};

/**
 * Create a security notification comment on a GitHub PR
 */
export const createSecurityBlockedComment = async ({
	owner,
	repository,
	prNumber,
	prAuthor,
	permission,
	githubId,
}: {
	owner: string;
	repository: string;
	prNumber: number;
	prAuthor: string;
	permission: string | null;
	githubId: string;
}) => {
	try {
		// Check if a security comment already exists to prevent duplicates
		const commentExists = await hasExistingSecurityComment({
			owner,
			repository,
			prNumber,
			githubId,
		});

		if (commentExists) {
			console.log(
				`ℹ️  Security notification comment already exists on PR #${prNumber}, skipping duplicate`,
			);
			return null;
		}

		const github = await findGithubById(githubId);
		const octokit = authGithub(github);

		const securityMessage = getSecurityBlockedMessage(
			prAuthor,
			repository,
			permission,
		);

		const issue = await octokit.rest.issues.createComment({
			owner,
			repo: repository,
			issue_number: prNumber,
			body: securityMessage,
		});

		console.log(
			`✅ Security notification comment created on PR #${prNumber}: ${issue.data.html_url}`,
		);
		return issue.data;
	} catch (error) {
		console.error(
			`❌ Failed to create security comment on PR #${prNumber}:`,
			error,
		);
		// Don't throw error - security comment is nice-to-have, not critical
		return null;
	}
};
