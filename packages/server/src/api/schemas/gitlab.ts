import { gitlab, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const gitlabSelectSchema = createSelectSchema(gitlab);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

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




export const apiTestConnectionGitlabOutput = z.string();

export const apiUpdateGitlabOutput = z.void();