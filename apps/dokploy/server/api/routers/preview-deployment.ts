import {
	findApplicationById,
	findPreviewDeploymentById,
	findPreviewDeploymentsByApplicationId,
	IS_CLOUD,
	removePreviewDeployment,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { apiFindAllByApplication } from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const previewDeploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.meta({
			openapi: {
				summary: "List preview deployments",
				description: "Returns all preview deployments associated with the given application.",
			},
		})
		.input(apiFindAllByApplication)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["read"],
			});
			return await findPreviewDeploymentsByApplicationId(input.applicationId);
		}),

	one: protectedProcedure
		.meta({
			openapi: {
				summary: "Get a preview deployment",
				description: "Returns the details of a specific preview deployment by its ID.",
			},
		})
		.input(z.object({ previewDeploymentId: z.string() }))
		.query(async ({ input, ctx }) => {
			const previewDeployment = await findPreviewDeploymentById(
				input.previewDeploymentId,
			);
			await checkServicePermissionAndAccess(
				ctx,
				previewDeployment.applicationId,
				{ deployment: ["read"] },
			);
			return previewDeployment;
		}),

	delete: protectedProcedure
		.meta({
			openapi: {
				summary: "Delete a preview deployment",
				description: "Permanently removes a preview deployment and its associated resources.",
			},
		})
		.input(z.object({ previewDeploymentId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const previewDeployment = await findPreviewDeploymentById(
				input.previewDeploymentId,
			);
			await checkServicePermissionAndAccess(
				ctx,
				previewDeployment.applicationId,
				{ deployment: ["cancel"] },
			);
			await removePreviewDeployment(input.previewDeploymentId);
			await audit(ctx, {
				action: "delete",
				resourceType: "previewDeployment",
				resourceId: input.previewDeploymentId,
			});
			return true;
		}),

	redeploy: protectedProcedure
		.meta({
			openapi: {
				summary: "Redeploy a preview deployment",
				description: "Triggers a rebuild of an existing preview deployment by adding a new job to the deployment queue.",
			},
		})
		.input(
			z.object({
				previewDeploymentId: z.string(),
				title: z.string().optional(),
				description: z.string().optional(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const previewDeployment = await findPreviewDeploymentById(
				input.previewDeploymentId,
			);
			await checkServicePermissionAndAccess(
				ctx,
				previewDeployment.applicationId,
				{ deployment: ["create"] },
			);
			const application = await findApplicationById(
				previewDeployment.applicationId,
			);
			const jobData: DeploymentJob = {
				applicationId: previewDeployment.applicationId,
				titleLog: input.title || "Rebuild Preview Deployment",
				descriptionLog: input.description || "",
				type: "redeploy",
				applicationType: "application-preview",
				previewDeploymentId: input.previewDeploymentId,
				server: !!application.serverId,
			};

			if (IS_CLOUD && application.serverId) {
				jobData.serverId = application.serverId;
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
				await audit(ctx, {
					action: "redeploy",
					resourceType: "previewDeployment",
					resourceId: input.previewDeploymentId,
				});
				return true;
			}
			await myQueue.add(
				"deployments",
				{ ...jobData },
				{
					removeOnComplete: true,
					removeOnFail: true,
				},
			);
			await audit(ctx, {
				action: "redeploy",
				resourceType: "previewDeployment",
				resourceId: input.previewDeploymentId,
			});
			return true;
		}),
});
