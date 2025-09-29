import { bitbucket, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const bitbucketSelectSchema = createSelectSchema(bitbucket);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

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

export const apiTestConnectionBitbucketOutput = z.string();

export const apiUpdateBitbucketOutput = bitbucketSelectSchema;
