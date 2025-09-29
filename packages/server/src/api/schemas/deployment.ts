import { deployments } from "@dokploy/server/db/schema/deployment";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const deploymentsSelectSchema = createSelectSchema(deployments);

export const apiDeploymentAllOutput = z.array(deploymentsSelectSchema);
