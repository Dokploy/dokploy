import { queuedDeploymentJobSchema } from "@dokploy/server";
import { z } from "zod";

export const deployJobSchema = queuedDeploymentJobSchema.and(
	z.object({ serverId: z.string().min(1) }),
);
