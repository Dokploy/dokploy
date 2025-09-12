import { github, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const githubSelectSchema = createSelectSchema(github);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

// Output schemas for GitHub endpoints
export const apiFindOneGithubOutput = githubSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

export const apiGithubProvidersOutput = z.array(
	z.object({
		githubId: z.string(),
		gitProvider: gitProviderSelectSchema,
	})
);

// GitHub API response schemas (simplified)
export const apiGithubRepositorySchema = z.object({
	id: z.number(),
	name: z.string(),
	full_name: z.string(),
	html_url: z.string(),
	description: z.string().nullable(),
	private: z.boolean(),
	fork: z.boolean(),
	owner: z.object({
		login: z.string(),
		id: z.number(),
		avatar_url: z.string(),
		html_url: z.string(),
	}),
});

export const apiGithubBranchSchema = z.object({
	name: z.string(),
	commit: z.object({
		sha: z.string(),
		url: z.string(),
	}),
	protected: z.boolean(),
});

export const apiGetGithubRepositoriesOutput = z.array(apiGithubRepositorySchema);

export const apiGetGithubBranchesOutput = z.array(apiGithubBranchSchema);

export const apiTestConnectionGithubOutput = z.string();

export const apiUpdateGithubOutput = z.void();