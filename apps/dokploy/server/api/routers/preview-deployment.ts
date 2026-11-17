import {
	findApplicationById,
	findPreviewDeploymentById,
	findPreviewDeploymentByPullRequestNumber,
	findPreviewDeploymentsByApplicationId,
	getDomainHost,
	IS_CLOUD,
	removePreviewDeployment,
	upsertPreviewDeploymentFromImage,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import {
	apiDeployPreviewFromImage,
	apiFindAllByApplication,
	apiFindPreviewByPullRequest,
} from "@/server/db/schema";
import type { DeploymentJob } from "@/server/queues/queue-types";
import {
	cleanQueuesByPreviewDeployment,
	myQueue,
} from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import { createTRPCRouter, protectedProcedure } from "../trpc";

export const previewDeploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllByApplication)
		.query(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["read"],
			});
			return await findPreviewDeploymentsByApplicationId(input.applicationId);
		}),

	one: protectedProcedure
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
				serverId: application.serverId ?? undefined,
			};

			if (IS_CLOUD && application.serverId) {
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

	deployFromImage: protectedProcedure
		.input(apiDeployPreviewFromImage)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["create"],
			});
			const previewDeployment = await upsertPreviewDeploymentFromImage(input);
			const { serverId } = previewDeployment.application;
			const jobData: DeploymentJob = {
				applicationId: input.applicationId,
				titleLog: "Preview Deployment",
				descriptionLog: `Image: ${input.dockerImage}`,
				type: "deploy",
				applicationType: "application-preview",
				previewDeploymentId: previewDeployment.previewDeploymentId,
				server: !!serverId,
				serverId: serverId ?? undefined,
			};

			if (IS_CLOUD && serverId) {
				deploy(jobData).catch((error) => {
					console.error("Background deployment failed:", error);
				});
			} else {
				// Only the latest image of a pull request is worth deploying. A deploy
				// that already started finishes, then this one deploys the new image.
				cleanQueuesByPreviewDeployment(previewDeployment.previewDeploymentId);
				await myQueue.add(
					"deployments",
					{ ...jobData },
					{
						removeOnComplete: true,
						removeOnFail: true,
					},
				);
			}
			await audit(ctx, {
				action: "deploy",
				resourceType: "previewDeployment",
				resourceId: previewDeployment.previewDeploymentId,
			});
			const { domain } = previewDeployment;
			return {
				previewDeploymentId: previewDeployment.previewDeploymentId,
				url: domain ? `${getDomainHost(domain)}${domain.path || "/"}` : null,
			};
		}),

	deleteByPullRequest: protectedProcedure
		.input(apiFindPreviewByPullRequest)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				deployment: ["cancel"],
			});
			const previewDeployment = await findPreviewDeploymentByPullRequestNumber(
				input.applicationId,
				input.pullRequestNumber,
			);
			if (!previewDeployment) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Preview Deployment not found",
				});
			}
			await removePreviewDeployment(previewDeployment.previewDeploymentId);
			await audit(ctx, {
				action: "delete",
				resourceType: "previewDeployment",
				resourceId: previewDeployment.previewDeploymentId,
			});
			return true;
		}),
});
