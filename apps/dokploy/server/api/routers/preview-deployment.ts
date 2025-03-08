import { db } from "@/server/db";
import { apiFindAllByApplication, applications } from "@/server/db/schema";
import {
	createPreviewDeployment,
	findApplicationById,
	findPreviewDeploymentByApplicationId,
	findPreviewDeploymentById,
	findPreviewDeploymentsByApplicationId,
	findPreviewDeploymentsByPullRequestId,
	IS_CLOUD,
	removePreviewDeployment,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, protectedProcedure } from "../trpc";
import { eq } from "drizzle-orm";
import { and } from "drizzle-orm";
import { myQueue } from "@/server/queues/queueSetup";
import { deploy } from "@/server/utils/deploy";
import type { DeploymentJob } from "@/server/queues/queue-types";

export const previewDeploymentRouter = createTRPCRouter({
	all: protectedProcedure
		.input(apiFindAllByApplication)
		.query(async ({ input, ctx }) => {
			const application = await findApplicationById(input.applicationId);
			if (
				application.project.organizationId !== ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this application",
				});
			}
			return await findPreviewDeploymentsByApplicationId(input.applicationId);
		}),
	delete: protectedProcedure
		.input(z.object({ previewDeploymentId: z.string() }))
		.mutation(async ({ input, ctx }) => {
			const previewDeployment = await findPreviewDeploymentById(
				input.previewDeploymentId,
			);
			if (
				previewDeployment.application.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to delete this preview deployment",
				});
			}
			await removePreviewDeployment(input.previewDeploymentId);
			return true;
		}),
	one: protectedProcedure
		.input(z.object({ previewDeploymentId: z.string() }))
		.query(async ({ input, ctx }) => {
			const previewDeployment = await findPreviewDeploymentById(
				input.previewDeploymentId,
			);
			if (
				previewDeployment.application.project.organizationId !==
				ctx.session.activeOrganizationId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this preview deployment",
				});
			}
			return previewDeployment;
		}),
	create: protectedProcedure
		.input(
			z.object({
				action: z.enum(["opened", "synchronize", "reopened", "closed"]),
				pullRequestId: z.string(),
				repository: z.string(),
				owner: z.string(),
				branch: z.string(),
				deploymentHash: z.string(),
				prBranch: z.string(),
				prNumber: z.any(),
				prTitle: z.string(),
				prURL: z.string(),
			}),
		)
		.mutation(async ({ input, ctx }) => {
			const organizationId = ctx.session.activeOrganizationId;
			const action = input.action;
			const prId = input.pullRequestId;

			if (action === "closed") {
				const previewDeploymentResult =
					await findPreviewDeploymentsByPullRequestId(prId);

				const filteredPreviewDeploymentResult = previewDeploymentResult.filter(
					(previewDeployment) =>
						previewDeployment.application.project.organizationId ===
						organizationId,
				);

				if (filteredPreviewDeploymentResult.length > 0) {
					for (const previewDeployment of filteredPreviewDeploymentResult) {
						try {
							await removePreviewDeployment(
								previewDeployment.previewDeploymentId,
							);
						} catch (error) {
							console.log(error);
						}
					}
				}

				return {
					message: "Preview Deployments Closed",
				};
			}

			if (
				action === "opened" ||
				action === "synchronize" ||
				action === "reopened"
			) {
				const deploymentHash = input.deploymentHash;

				const prBranch = input.prBranch;
				const prNumber = input.prNumber;
				const prTitle = input.prTitle;
				const prURL = input.prURL;
				const apps = await db.query.applications.findMany({
					where: and(
						eq(applications.sourceType, "github"),
						eq(applications.repository, input.repository),
						eq(applications.branch, input.branch),
						eq(applications.isPreviewDeploymentsActive, true),
						eq(applications.owner, input.owner),
					),
					with: {
						previewDeployments: true,
						project: true,
					},
				});

				const filteredApps = apps.filter(
					(app) => app.project.organizationId === organizationId,
				);

				console.log(filteredApps);

				for (const app of filteredApps) {
					const previewLimit = app?.previewLimit || 0;
					if (app?.previewDeployments?.length > previewLimit) {
						continue;
					}
					const previewDeploymentResult =
						await findPreviewDeploymentByApplicationId(app.applicationId, prId);

					let previewDeploymentId =
						previewDeploymentResult?.previewDeploymentId || "";

					if (!previewDeploymentResult) {
						try {
							const previewDeployment = await createPreviewDeployment({
								applicationId: app.applicationId as string,
								branch: prBranch,
								pullRequestId: prId,
								pullRequestNumber: prNumber,
								pullRequestTitle: prTitle,
								pullRequestURL: prURL,
							});

							console.log(previewDeployment);
							previewDeploymentId = previewDeployment.previewDeploymentId;
						} catch (error) {
							console.log(error);
						}
					}

					const jobData: DeploymentJob = {
						applicationId: app.applicationId as string,
						titleLog: "Preview Deployment",
						descriptionLog: `Hash: ${deploymentHash}`,
						type: "deploy",
						applicationType: "application-preview",
						server: !!app.serverId,
						previewDeploymentId,
						isExternal: true,
					};

					if (IS_CLOUD && app.serverId) {
						jobData.serverId = app.serverId;
						await deploy(jobData);
						continue;
					}
					await myQueue.add(
						"deployments",
						{ ...jobData },
						{
							removeOnComplete: true,
							removeOnFail: true,
						},
					);
				}
			}

			return {
				message: "Preview Deployments Created",
			};
		}),
});
