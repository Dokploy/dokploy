import {
	findApplicationById,
	findPreviewDeploymentById,
	findPreviewDeploymentsByApplicationId,
	removePreviewDeployment,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { z } from "zod";
import { audit } from "@/server/api/utils/audit";
import { apiFindAllByApplication } from "@/server/db/schema";
import { enqueueDeploymentJob } from "@/server/queues/enqueue-deployment";
import type { DeploymentJob } from "@/server/queues/queue-types";
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
				serverId: application.serverId || undefined,
			};
			await enqueueDeploymentJob(jobData);
			await audit(ctx, {
				action: "redeploy",
				resourceType: "previewDeployment",
				resourceId: input.previewDeploymentId,
			});
			return true;
		}),
});
