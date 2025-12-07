import {
	bitbucket,
	gitea,
	github,
	gitlab,
	gitProvider,
} from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const gitProviderSelectSchema = createSelectSchema(gitProvider);
const gitlabSelectSchema = createSelectSchema(gitlab);
const bitbucketSelectSchema = createSelectSchema(bitbucket);
const githubSelectSchema = createSelectSchema(github);
const giteaSelectSchema = createSelectSchema(gitea);

export const apiGitProviderWithRelationsSchema = gitProviderSelectSchema.extend(
	{
		gitlab: gitlabSelectSchema.nullable(),
		bitbucket: bitbucketSelectSchema.nullable(),
		github: githubSelectSchema.nullable(),
		gitea: giteaSelectSchema.nullable(),
	},
);

export const apiGetAllGitProvidersOutput = z.array(
	apiGitProviderWithRelationsSchema,
);

export const apiRemoveGitProviderOutput = z.object({
	success: z.boolean(),
});
