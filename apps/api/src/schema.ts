import { z } from "zod";

export const deployJobSchema = z.discriminatedUnion("applicationType", [
	z.object({
		applicationId: z.string(),
		titleLog: z.string().optional(),
		descriptionLog: z.string().optional(),
		server: z.boolean().optional(),
		type: z.enum(["deploy", "redeploy"]),
		applicationType: z.literal("application"),
		serverId: z.string().min(1),
	}),
	z.object({
		composeId: z.string(),
		titleLog: z.string().optional(),
		descriptionLog: z.string().optional(),
		server: z.boolean().optional(),
		type: z.enum(["deploy", "redeploy"]),
		applicationType: z.literal("compose"),
		serverId: z.string().min(1),
	}),
	z.object({
		applicationId: z.string(),
		previewDeploymentId: z.string(),
		titleLog: z.string().optional(),
		descriptionLog: z.string().optional(),
		server: z.boolean().optional(),
		type: z.enum(["deploy"]),
		applicationType: z.literal("application-preview"),
		serverId: z.string().min(1),
	}),
]);

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
