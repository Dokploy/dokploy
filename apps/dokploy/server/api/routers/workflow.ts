import {
	assertGitProviderAccess,
	cancelWorkflowRun,
	dispatchWorkflowRun,
	findGithubById,
	findWorkflowForOrganization,
	findWorkflowRepositoryForOrganization,
	findWorkflowRunForOrganization,
	findWorkflowSecretForOrganization,
	importWorkflowRepository,
	listWorkflowRepositories,
	listWorkflowRuns,
	listWorkflowSecrets,
	listWorkflows,
	removeWorkflowRepository,
	removeWorkflowSecret,
	rerunWorkflowRun,
	setWorkflowEnabled,
	syncWorkflowDefinitions,
	updateWorkflowRepository,
	upsertWorkflowSecret,
} from "@dokploy/server";
import { audit } from "@/server/api/utils/audit";
import {
	apiDispatchWorkflow,
	apiFindWorkflowRepository,
	apiFindWorkflowRun,
	apiImportWorkflowRepository,
	apiListWorkflowRuns,
	apiRemoveWorkflowSecret,
	apiToggleWorkflow,
	apiUpdateWorkflowRepository,
	apiUpsertWorkflowSecret,
} from "@/server/db/schema";
import { createTRPCRouter, withPermission } from "../trpc";

export const workflowRouter = createTRPCRouter({
	repositories: withPermission("workflow", "read").query(({ ctx }) =>
		listWorkflowRepositories(ctx.session.activeOrganizationId),
	),
	repository: withPermission("workflow", "read")
		.input(apiFindWorkflowRepository)
		.query(async ({ ctx, input }) => {
			const repository = await findWorkflowRepositoryForOrganization(
				input.workflowRepositoryId,
				ctx.session.activeOrganizationId,
			);
			return {
				workflowRepositoryId: repository.workflowRepositoryId,
				owner: repository.owner,
				repository: repository.repository,
				defaultBranch: repository.defaultBranch,
				runDokployWorkflows: repository.runDokployWorkflows,
				runGithubWorkflows: repository.runGithubWorkflows,
				lastSyncedAt: repository.lastSyncedAt,
				syncError: repository.syncError,
				serverId: repository.serverId,
				server: repository.server,
				githubId: repository.githubId,
				githubUrl: repository.github.githubUrl,
			};
		}),
	importRepository: withPermission("workflow", "create")
		.input(apiImportWorkflowRepository)
		.mutation(async ({ ctx, input }) => {
			const githubProvider = await findGithubById(input.githubId);
			await assertGitProviderAccess(ctx.session, githubProvider.gitProvider);
			const repository = await importWorkflowRepository(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "workflowRepository",
				resourceId: repository.workflowRepositoryId,
				resourceName: `${repository.owner}/${repository.repository}`,
			});
			return repository;
		}),
	updateRepository: withPermission("workflow", "update")
		.input(apiUpdateWorkflowRepository)
		.mutation(async ({ ctx, input }) => {
			const repository = await updateWorkflowRepository(
				input,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "update",
				resourceType: "workflowRepository",
				resourceId: repository.workflowRepositoryId,
				resourceName: `${repository.owner}/${repository.repository}`,
			});
			return true;
		}),
	removeRepository: withPermission("workflow", "delete")
		.input(apiFindWorkflowRepository)
		.mutation(async ({ ctx, input }) => {
			const repository = await removeWorkflowRepository(
				input.workflowRepositoryId,
				ctx.session.activeOrganizationId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "workflowRepository",
				resourceId: repository.workflowRepositoryId,
				resourceName: `${repository.owner}/${repository.repository}`,
			});
			return true;
		}),
	sync: withPermission("workflow", "update")
		.input(apiFindWorkflowRepository)
		.mutation(async ({ ctx, input }) => {
			await findWorkflowRepositoryForOrganization(
				input.workflowRepositoryId,
				ctx.session.activeOrganizationId,
			);
			await syncWorkflowDefinitions(input.workflowRepositoryId);
			return true;
		}),
	workflows: withPermission("workflow", "read")
		.input(apiFindWorkflowRepository)
		.query(async ({ ctx, input }) => {
			await findWorkflowRepositoryForOrganization(
				input.workflowRepositoryId,
				ctx.session.activeOrganizationId,
			);
			return await listWorkflows(input.workflowRepositoryId);
		}),
	toggleWorkflow: withPermission("workflow", "update")
		.input(apiToggleWorkflow)
		.mutation(async ({ ctx, input }) => {
			const workflow = await findWorkflowForOrganization(
				input.workflowId,
				ctx.session.activeOrganizationId,
			);
			await setWorkflowEnabled(input.workflowId, input.enabled);
			await audit(ctx, {
				action: "update",
				resourceType: "workflow",
				resourceId: workflow.workflowId,
				resourceName: workflow.path,
				metadata: { enabled: input.enabled },
			});
			return true;
		}),
	dispatch: withPermission("workflow", "run")
		.input(apiDispatchWorkflow)
		.mutation(async ({ ctx, input }) => {
			const workflow = await findWorkflowForOrganization(
				input.workflowId,
				ctx.session.activeOrganizationId,
			);
			const run = await dispatchWorkflowRun({
				...input,
				actor: ctx.user.email,
			});
			await audit(ctx, {
				action: "run",
				resourceType: "workflow",
				resourceId: workflow.workflowId,
				resourceName: workflow.path,
				metadata: { branch: input.branch, workflowRunId: run.workflowRunId },
			});
			return run;
		}),
	runs: withPermission("workflow", "read")
		.input(apiListWorkflowRuns)
		.query(({ ctx, input }) =>
			listWorkflowRuns({
				...input,
				organizationId: ctx.session.activeOrganizationId,
			}),
		),
	run: withPermission("workflow", "read")
		.input(apiFindWorkflowRun)
		.query(({ ctx, input }) =>
			findWorkflowRunForOrganization(
				input.workflowRunId,
				ctx.session.activeOrganizationId,
			),
		),
	cancelRun: withPermission("workflow", "run")
		.input(apiFindWorkflowRun)
		.mutation(async ({ ctx, input }) => {
			const run = await findWorkflowRunForOrganization(
				input.workflowRunId,
				ctx.session.activeOrganizationId,
			);
			await cancelWorkflowRun(input.workflowRunId);
			await audit(ctx, {
				action: "cancel",
				resourceType: "workflow",
				resourceId: run.workflowRunId,
				resourceName: `${run.workflowName} #${run.runNumber}`,
			});
			return true;
		}),
	rerun: withPermission("workflow", "run")
		.input(apiFindWorkflowRun)
		.mutation(async ({ ctx, input }) => {
			const run = await findWorkflowRunForOrganization(
				input.workflowRunId,
				ctx.session.activeOrganizationId,
			);
			const newRun = await rerunWorkflowRun(input.workflowRunId);
			await audit(ctx, {
				action: "run",
				resourceType: "workflow",
				resourceId: newRun.workflowRunId,
				resourceName: `${run.workflowName} #${run.runNumber}`,
				metadata: { attempt: newRun.attempt },
			});
			return newRun;
		}),
	secrets: withPermission("workflow", "update")
		.input(apiFindWorkflowRepository)
		.query(async ({ ctx, input }) => {
			await findWorkflowRepositoryForOrganization(
				input.workflowRepositoryId,
				ctx.session.activeOrganizationId,
			);
			return await listWorkflowSecrets(input.workflowRepositoryId);
		}),
	upsertSecret: withPermission("workflow", "update")
		.input(apiUpsertWorkflowSecret)
		.mutation(async ({ ctx, input }) => {
			const repository = await findWorkflowRepositoryForOrganization(
				input.workflowRepositoryId,
				ctx.session.activeOrganizationId,
			);
			await upsertWorkflowSecret(input);
			await audit(ctx, {
				action: "update",
				resourceType: "workflowRepository",
				resourceId: repository.workflowRepositoryId,
				resourceName: `${repository.owner}/${repository.repository}`,
				metadata: { [input.type]: input.name },
			});
			return true;
		}),
	removeSecret: withPermission("workflow", "update")
		.input(apiRemoveWorkflowSecret)
		.mutation(async ({ ctx, input }) => {
			const secret = await findWorkflowSecretForOrganization(
				input.workflowSecretId,
				ctx.session.activeOrganizationId,
			);
			await removeWorkflowSecret(input.workflowSecretId);
			await audit(ctx, {
				action: "update",
				resourceType: "workflowRepository",
				resourceId: secret.workflowRepositoryId,
				metadata: { removed: secret.name, type: secret.type },
			});
			return true;
		}),
});
