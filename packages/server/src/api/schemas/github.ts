import { github, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const githubSelectSchema = createSelectSchema(github);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

export const apiFindOneGithubOutput = githubSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

export const apiGithubProvidersOutput = z.array(
	z.object({
		githubId: z.string(),
		gitProvider: gitProviderSelectSchema,
	})
);






export const apiTestConnectionGithubOutput = z.string();

export const apiUpdateGithubOutput = z.void();