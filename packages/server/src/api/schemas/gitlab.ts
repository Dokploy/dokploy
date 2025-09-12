import { gitlab, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const gitlabSelectSchema = createSelectSchema(gitlab);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

// Output schemas for Gitlab endpoints
export const apiFindOneGitlabOutput = gitlabSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

export const apiGitlabProvidersOutput = z.array(
	z.object({
		gitlabId: z.string(),
		gitProvider: gitProviderSelectSchema,
		gitlabUrl: z.string(),
	})
);

export const apiCreateGitlabOutput = gitlabSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

// GitLab API response schemas (simplified)
export const apiGitlabRepositorySchema = z.object({
	id: z.number(),
	name: z.string(),
	url: z.string(),
	owner: z.object({
		username: z.string(),
	}),
});

export const apiGitlabBranchSchema = z.object({
	id: z.string(),
	name: z.string(),
	commit: z.object({
		id: z.string(),
	}),
});

export const apiGetGitlabRepositoriesOutput = z.array(apiGitlabRepositorySchema);

export const apiGetGitlabBranchesOutput = z.array(apiGitlabBranchSchema);

export const apiTestConnectionGitlabOutput = z.string();

export const apiUpdateGitlabOutput = z.void();