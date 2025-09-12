import { previewDeployments } from "@dokploy/server/db/schema/preview-deployments";
import { createSelectSchema } from "drizzle-zod";
import { z } from "zod";

const previewDeploymentsSelectSchema = createSelectSchema(previewDeployments);

export const apiCreatePreviewDeploymentOutput = previewDeploymentsSelectSchema;

export const apiFindOnePreviewDeploymentOutput = previewDeploymentsSelectSchema;

export const apiFindAllPreviewDeploymentsOutput = z.array(previewDeploymentsSelectSchema);

export const apiDeletePreviewDeploymentOutput = z.boolean();