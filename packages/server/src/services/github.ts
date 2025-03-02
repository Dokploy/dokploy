import { db } from "@dokploy/server/db";
import {
	type apiCreateGithub,
	gitProvider,
	github,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { authGithub } from "../utils/providers/github";
import { updatePreviewDeployment } from "./preview-deployment";

export type Github = typeof github.$inferSelect;
export const createGithub = async (
	input: typeof apiCreateGithub._type,
	adminId: string,
) => {
	return await db.transaction(async (tx) => {
		const newGitProvider = await tx
			.insert(gitProvider)
			.values({
				providerType: "github",
				adminId: adminId,
				name: input.name,
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
	} catch (error) {
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

interface CommentCreate {
	appName: string;
	owner: string;
	repository: string;
	issue_number: string;
	previewDomain: string;
	githubId: string;
	previewDeploymentId: string;
}

export const createPreviewDeploymentComment = async ({
	owner,
	repository,
	issue_number,
	previewDomain,
	appName,
	githubId,
	previewDeploymentId,
}: CommentCreate) => {
	const github = await findGithubById(githubId);
	const octokit = authGithub(github);

	const runningComment = getIssueComment(
		appName,
		"initializing",
		previewDomain,
	);

	const issue = await octokit.rest.issues.createComment({
		owner: owner || "",
		repo: repository || "",
		issue_number: Number.parseInt(issue_number),
		body: `### Dokploy Preview Deployment\n\n${runningComment}`,
	});

	return await updatePreviewDeployment(previewDeploymentId, {
		pullRequestCommentId: `${issue.data.id}`,
	}).then((response) => response[0]);
};
