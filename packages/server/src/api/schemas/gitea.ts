import { gitea, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const giteaSelectSchema = createSelectSchema(gitea);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

// Output schemas for Gitea endpoints
export const apiFindOneGiteaOutput = giteaSelectSchema.extend({
	gitProvider: gitProviderSelectSchema,
});

export const apiGiteaProvidersOutput = z.array(
	z.object({
		giteaId: z.string(),
		gitProvider: gitProviderSelectSchema,
	})
);

export const apiCreateGiteaOutput = z.object({
	giteaId: z.string(),
	giteaUrl: z.string(),
	clientId: z.string(),
});

// Gitea API response schemas (simplified)
export const apiGiteaRepositorySchema = z.object({
	id: z.number(),
	name: z.string(),
	url: z.string(),
	owner: z.object({
		username: z.string(),
	}),
});

export const apiGiteaBranchSchema = z.object({
	id: z.string(),
	name: z.string(),
	commit: z.object({
		id: z.string(),
	}),
});

export const apiGetGiteaRepositoriesOutput = z.array(apiGiteaRepositorySchema);

export const apiGetGiteaBranchesOutput = z.array(apiGiteaBranchSchema);

export const apiTestConnectionGiteaOutput = z.string();

export const apiUpdateGiteaOutput = z.object({
	success: z.boolean(),
});

export const apiGetGiteaUrlOutput = z.string();
