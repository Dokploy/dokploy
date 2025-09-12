import { bitbucket, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const bitbucketSelectSchema = createSelectSchema(bitbucket);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

// Output schemas for Bitbucket endpoints
export const apiFindOneBitbucketOutput = bitbucketSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

export const apiBitbucketProvidersOutput = z.array(
	z.object({
		bitbucketId: z.string(),
		gitProvider: gitProviderSelectSchema,
	})
);

export const apiCreateBitbucketOutput = bitbucketSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

export const apiBitbucketRepositorySchema = z.object({
	name: z.string(),
	url: z.string(),
	owner: z.object({
		username: z.string(),
	}),
});

export const apiBitbucketBranchSchema = z.object({
	name: z.string(),
	commit: z.object({
		sha: z.string(),
	}),
});

export const apiGetBitbucketRepositoriesOutput = z.array(apiBitbucketRepositorySchema);

export const apiGetBitbucketBranchesOutput = z.array(apiBitbucketBranchSchema);

export const apiTestConnectionBitbucketOutput = z.string();

export const apiUpdateBitbucketOutput = bitbucketSelectSchema;