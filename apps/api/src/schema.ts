import { z } from "zod";

export const deployJobSchema = z.discriminatedUnion("applicationType", [
	z.object({
		applicationId: z.string(),
		titleLog: z.string(),
		descriptionLog: z.string(),
		server: z.boolean().optional(),
		type: z.enum(["deploy", "redeploy"]),
		applicationType: z.literal("application"),
		serverId: z.string(),
	}),
	z.object({
		composeId: z.string(),
		titleLog: z.string(),
		descriptionLog: z.string(),
		server: z.boolean().optional(),
		type: z.enum(["deploy", "redeploy"]),
		applicationType: z.literal("compose"),
		serverId: z.string(),
	}),
]);

export type DeployJob = z.infer<typeof deployJobSchema>;
