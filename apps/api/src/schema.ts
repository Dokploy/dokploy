import { deploymentJobSchema } from "@dokploy/server";
import { z } from "zod";

export const deployJobSchema = deploymentJobSchema.and(
	z.object({ serverId: z.string().min(1) }),
);

export type DeployJob = z.infer<typeof deployJobSchema>;

export const cancelDeploymentSchema = z.discriminatedUnion("applicationType", [
	z.object({
		applicationId: z.string(),
		applicationType: z.literal("application"),
	}),
	z.object({
		composeId: z.string(),
		applicationType: z.literal("compose"),
	}),
]);

export type CancelDeploymentJob = z.infer<typeof cancelDeploymentSchema>;
