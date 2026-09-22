import { z } from "zod";

const deploymentOptions = {
	titleLog: z.string().default(""),
	descriptionLog: z.string().default(""),
	server: z.boolean().optional(),
	serverId: z.string().min(1).optional(),
	type: z.enum(["deploy", "redeploy"]),
};

export const deploymentJobSchema = z.discriminatedUnion("applicationType", [
	z.object({
		...deploymentOptions,
		applicationType: z.literal("application"),
		applicationId: z.string().min(1),
	}),
	z.object({
		...deploymentOptions,
		applicationType: z.literal("compose"),
		composeId: z.string().min(1),
		freshVolumes: z.boolean().optional(),
	}),
	z.object({
		...deploymentOptions,
		applicationType: z.literal("application-preview"),
		applicationId: z.string().min(1),
		previewDeploymentId: z.string().min(1),
	}),
]);

export type DeploymentJob = z.infer<typeof deploymentJobSchema>;
