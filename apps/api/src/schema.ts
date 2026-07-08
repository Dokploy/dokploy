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
		type: z.enum(["deploy", "redeploy"]),
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

const signedDeploymentScopeSchema = z.object({
	version: z.literal(1),
	operation: z.enum(["deploy", "cancel"]),
	applicationType: z.enum(["application", "compose", "application-preview"]),
	objectId: z.string().min(1),
	applicationId: z.string().nullable(),
	deploymentType: z.enum(["deploy", "redeploy"]).nullable(),
	serverId: z.string().nullable(),
	organizationId: z.string().nullable(),
	expiresAt: z.number().int(),
	nonce: z.string().min(1),
});

const signedDeploymentClaimSchema = z.object({
	scope: signedDeploymentScopeSchema,
	signature: z.string().min(1),
});

const signedDeploymentJobsReadScopeSchema = z.object({
	version: z.literal(1),
	operation: z.literal("read-jobs"),
	serverId: z.string().min(1),
	organizationId: z.string().nullable(),
	expiresAt: z.number().int(),
	nonce: z.string().min(1),
});

export const signedDeploymentJobsReadSchema = z.object({
	serverId: z.string().min(1),
	scope: signedDeploymentJobsReadScopeSchema,
	signature: z.string().min(1),
});

export const signedDeployJobSchema = deployJobSchema.and(
	signedDeploymentClaimSchema,
);

export const signedCancelDeploymentSchema = cancelDeploymentSchema.and(
	signedDeploymentClaimSchema,
);
