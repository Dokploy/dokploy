import { gitea, gitProvider } from "@dokploy/server/db/schema";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const giteaSelectSchema = createSelectSchema(gitea);
const gitProviderSelectSchema = createSelectSchema(gitProvider);

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

export const apiTestConnectionGiteaOutput = z.string();

export const apiUpdateGiteaOutput = z.object({
  success: z.boolean(),
});

export const apiGetGiteaUrlOutput = z.string();
