import { z } from "zod";

const deploymentOptions = {
	titleLog: z.string().default(""),
	descriptionLog: z.string().default(""),
	serverId: z.string().min(1).optional(),
	type: z.enum(["deploy", "redeploy"]),
};

const applicationTarget = z.object({
	applicationType: z.literal("application"),
	applicationId: z.string().min(1),
});
const composeTarget = z.object({
	applicationType: z.literal("compose"),
	composeId: z.string().min(1),
});
const previewTarget = z.object({
	applicationType: z.literal("application-preview"),
	applicationId: z.string().min(1),
	previewDeploymentId: z.string().min(1),
});
export const deploymentTargetSchema = z.discriminatedUnion("applicationType", [
	applicationTarget,
	composeTarget,
	previewTarget,
]);
export type DeploymentTarget = z.infer<typeof deploymentTargetSchema>;

export const deploymentJobSchema = z.discriminatedUnion("applicationType", [
	applicationTarget.extend(deploymentOptions),
	composeTarget.extend({
		...deploymentOptions,
		freshVolumes: z.boolean().optional(),
	}),
	previewTarget.extend(deploymentOptions),
]);

export type DeploymentJob = z.infer<typeof deploymentJobSchema>;

export const queuedDeploymentJobSchema = deploymentJobSchema.and(
	z.object({ deploymentId: z.string().min(1) }),
);

export type QueuedDeploymentJob = z.infer<typeof queuedDeploymentJobSchema>;
