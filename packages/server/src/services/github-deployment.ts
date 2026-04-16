import { findGithubById } from "./github";
import { authGithub } from "../utils/providers/github";

export type GithubDeploymentState =
	| "queued"
	| "in_progress"
	| "success"
	| "failure"
	| "error"
	| "inactive";

interface CreateDeploymentParams {
	githubId: string;
	owner: string;
	repository: string;
	ref: string;
	environment: string;
	description?: string;
	transient?: boolean;
}

interface SetDeploymentStatusParams {
	githubId: string;
	owner: string;
	repository: string;
	deploymentId: number;
	state: GithubDeploymentState;
	environmentUrl?: string;
	logUrl?: string;
	description?: string;
}

interface DeactivateDeploymentsParams {
	githubId: string;
	owner: string;
	repository: string;
	environment: string;
}

export const createGithubDeployment = async ({
	githubId,
	owner,
	repository,
	ref,
	environment,
	description,
	transient = true,
}: CreateDeploymentParams): Promise<number | null> => {
	try {
		const githubProvider = await findGithubById(githubId);
		const octokit = authGithub(githubProvider);

		const response = await octokit.rest.repos.createDeployment({
			owner,
			repo: repository,
			ref,
			environment,
			description,
			auto_merge: false,
			required_contexts: [],
			transient_environment: transient,
			production_environment: false,
		});

		if (response.status === 201 && "id" in response.data) {
			return response.data.id;
		}

		console.warn(
			`GitHub createDeployment returned non-success for ${owner}/${repository}@${ref}:`,
			response.data,
		);
		return null;
	} catch (error) {
		console.warn(
			`GitHub createDeployment failed for ${owner}/${repository}@${ref}:`,
			error,
		);
		return null;
	}
};

export const setGithubDeploymentStatus = async ({
	githubId,
	owner,
	repository,
	deploymentId,
	state,
	environmentUrl,
	logUrl,
	description,
}: SetDeploymentStatusParams): Promise<void> => {
	try {
		const githubProvider = await findGithubById(githubId);
		const octokit = authGithub(githubProvider);

		await octokit.rest.repos.createDeploymentStatus({
			owner,
			repo: repository,
			deployment_id: deploymentId,
			state,
			environment_url: environmentUrl,
			log_url: logUrl,
			description,
			auto_inactive: state === "success",
		});
	} catch (error) {
		console.warn(
			`GitHub createDeploymentStatus failed for deployment ${deploymentId} (${state}):`,
			error,
		);
	}
};

export const deactivateGithubDeployments = async ({
	githubId,
	owner,
	repository,
	environment,
}: DeactivateDeploymentsParams): Promise<void> => {
	try {
		const githubProvider = await findGithubById(githubId);
		const octokit = authGithub(githubProvider);

		const { data: deployments } = await octokit.rest.repos.listDeployments({
			owner,
			repo: repository,
			environment,
			per_page: 100,
		});

		for (const deployment of deployments) {
			try {
				await octokit.rest.repos.createDeploymentStatus({
					owner,
					repo: repository,
					deployment_id: deployment.id,
					state: "inactive",
					description: "Preview environment torn down",
				});
			} catch (error) {
				console.warn(
					`GitHub deactivate status failed for deployment ${deployment.id}:`,
					error,
				);
			}
		}
	} catch (error) {
		console.warn(
			`GitHub deactivateDeployments failed for ${owner}/${repository} env=${environment}:`,
			error,
		);
	}
};
