import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
	upsertProviderCredentials,
	getProviderCredentials,
	deleteProviderCredentials,
	listProviderCredentials,
	createProvisioningJob,
	updateProvisioningJobStatus,
	getProvisioningJob,
	listProvisioningJobs,
	provisionServer,
	deleteCloudServer,
	getDecryptedApiToken,
} from "@dokploy/server/services/cloud-provider";
import {
	CloudProvider,
	ProvisioningStatus,
} from "@dokploy/server/providers/types";
import { createCloudProvider } from "@dokploy/server/providers/factory";

const cloudProviderEnum = z.nativeEnum(CloudProvider);

export const cloudProviderRouter = createTRPCRouter({
	// Credentials Management
	credentials: createTRPCRouter({
		upsert: protectedProcedure
			.input(
				z.object({
					provider: cloudProviderEnum,
					apiToken: z.string().min(1),
					config: z.record(z.unknown()).optional(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					const credential = await upsertProviderCredentials(
						ctx.session.activeOrganizationId,
						input.provider,
						input.apiToken,
						input.config,
					);
					return {
						...credential,
						encryptedApiToken: undefined, // Don't return the token
					};
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to save credentials",
						cause: error,
					});
				}
			}),

		get: protectedProcedure
			.input(
				z.object({
					provider: cloudProviderEnum,
				}),
			)
			.query(async ({ ctx, input }) => {
				const credential = await getProviderCredentials(
					ctx.session.activeOrganizationId,
					input.provider,
				);

				if (!credential) {
					return null;
				}

				return {
					...credential,
					encryptedApiToken: undefined, // Don't return the token
				};
			}),

		delete: protectedProcedure
			.input(
				z.object({
					credentialId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				return await deleteProviderCredentials(input.credentialId);
			}),

		list: protectedProcedure.query(async ({ ctx }) => {
			return await listProviderCredentials(ctx.session.activeOrganizationId);
		}),
	}),

	// Provider Information (locations, types, images)
	provider: createTRPCRouter({
		listLocations: protectedProcedure
			.input(
				z.object({
					provider: cloudProviderEnum,
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const apiToken = await getDecryptedApiToken(
						ctx.session.activeOrganizationId,
						input.provider,
					);
					const providerClient = createCloudProvider(input.provider, apiToken);
					return await providerClient.listLocations();
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to fetch locations",
						cause: error,
					});
				}
			}),

		listServerTypes: protectedProcedure
			.input(
				z.object({
					provider: cloudProviderEnum,
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const apiToken = await getDecryptedApiToken(
						ctx.session.activeOrganizationId,
						input.provider,
					);
					const providerClient = createCloudProvider(input.provider, apiToken);
					return await providerClient.listServerTypes();
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to fetch server types",
						cause: error,
					});
				}
			}),

		listImages: protectedProcedure
			.input(
				z.object({
					provider: cloudProviderEnum,
				}),
			)
			.query(async ({ ctx, input }) => {
				try {
					const apiToken = await getDecryptedApiToken(
						ctx.session.activeOrganizationId,
						input.provider,
					);
					const providerClient = createCloudProvider(input.provider, apiToken);
					return await providerClient.listImages();
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error ? error.message : "Failed to fetch images",
						cause: error,
					});
				}
			}),
	}),

	// Server Provisioning
	server: createTRPCRouter({
		provision: protectedProcedure
			.input(
				z.object({
					provider: cloudProviderEnum,
					name: z.string().min(1),
					location: z.string(),
					serverType: z.string(),
					image: z.string(),
				}),
			)
			.mutation(async ({ ctx, input }) => {
				try {
					// Verify credentials exist
					const credentials = await getProviderCredentials(
						ctx.session.activeOrganizationId,
						input.provider,
					);

					if (!credentials || !credentials.isValid) {
						throw new TRPCError({
							code: "BAD_REQUEST",
							message: `Please configure ${input.provider} credentials first`,
						});
					}

					// Create provisioning job
					const job = await createProvisioningJob(
						ctx.session.activeOrganizationId,
						input.provider,
						{
							name: input.name,
							location: input.location,
							serverType: input.serverType,
							image: input.image,
						},
						credentials.credentialId,
					);

					// Start provisioning in background (don't await)
					provisionServer(
						job.jobId,
						ctx.session.activeOrganizationId,
						credentials.credentialId,
						input.provider,
						{
							name: input.name,
							location: input.location,
							serverType: input.serverType,
							image: input.image,
						},
					).catch((error) => {
						console.error("Provisioning failed:", error);
						// Error handling is done in provisionServer
					});

					return {
						jobId: job.jobId,
						status: job.status,
					};
				} catch (error) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message:
							error instanceof Error
								? error.message
								: "Failed to start provisioning",
						cause: error,
					});
				}
			}),

		delete: protectedProcedure
			.input(
				z.object({
					serverId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				return await deleteCloudServer(input.serverId);
			}),
	}),

	// Provisioning Jobs
	job: createTRPCRouter({
		status: protectedProcedure
			.input(
				z.object({
					jobId: z.string(),
				}),
			)
			.query(async ({ input }) => {
				return await getProvisioningJob(input.jobId);
			}),

		list: protectedProcedure.query(async ({ ctx }) => {
			return await listProvisioningJobs(ctx.session.activeOrganizationId);
		}),

		cancel: protectedProcedure
			.input(
				z.object({
					jobId: z.string(),
				}),
			)
			.mutation(async ({ input }) => {
				const job = await getProvisioningJob(input.jobId);

				// Can only cancel pending or in-progress jobs
				if (
					job.status === ProvisioningStatus.COMPLETED ||
					job.status === ProvisioningStatus.FAILED
				) {
					throw new TRPCError({
						code: "BAD_REQUEST",
						message: "Cannot cancel a completed or failed job",
					});
				}

				return await updateProvisioningJobStatus(
					input.jobId,
					ProvisioningStatus.FAILED,
					"Cancelled by user",
				);
			}),

		clearAll: protectedProcedure.mutation(async ({ ctx }) => {
			const db = (await import("@dokploy/server/db")).db;
			const { serverProvisioningJob } = await import(
				"@dokploy/server/db/schema"
			);
			const { eq } = await import("drizzle-orm");

			// Delete all jobs for this organization
			await db
				.delete(serverProvisioningJob)
				.where(
					eq(
						serverProvisioningJob.organizationId,
						ctx.session.activeOrganizationId,
					),
				);

			return { success: true };
		}),
	}),
});
