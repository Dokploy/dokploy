import {
	createSandbox,
	execInSandbox,
	findEnvironmentById,
	findProjectById,
	findSandboxById,
	findSandboxesByEnvironmentId,
	findSandboxesByProjectId,
	getAccessibleServerIds,
	getWebServerSettings,
	IS_CLOUD,
	killSandbox,
	listSandboxFiles,
	readSandboxFile,
	removeSandbox,
	SANDBOX_TEMPLATES,
	setSandboxTimeout,
	writeSandboxFile,
} from "@dokploy/server";
import {
	addNewService,
	checkEnvironmentAccess,
	checkServiceAccess,
	checkServicePermissionAndAccess,
	findMemberByUserId,
} from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateSandbox,
	apiExecSandbox,
	apiFindOneSandbox,
	apiListFilesSandbox,
	apiListSandboxes,
	apiReadFileSandbox,
	apiSetTimeoutSandbox,
	apiWriteFileSandbox,
} from "@/server/db/schema";

type Ctx = {
	user: { id: string; role: string };
	session: { activeOrganizationId: string };
};

const findAccessibleSandbox = async (
	ctx: Ctx,
	sandboxId: string,
	mode: "read" | "use" | "delete",
) => {
	if (mode === "read") {
		await checkServiceAccess(ctx, sandboxId, "read");
	} else if (mode === "delete") {
		await checkServiceAccess(ctx, sandboxId, "delete");
	} else {
		await checkServicePermissionAndAccess(ctx, sandboxId, {
			deployment: ["create"],
		});
	}
	const sandbox = await findSandboxById(sandboxId);
	if (
		sandbox.environment.project.organizationId !==
		ctx.session.activeOrganizationId
	) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not authorized to access this sandbox",
		});
	}
	return sandbox;
};

const stripSecrets = <T extends { envVars: string | null }>(sandbox: T) => {
	const { envVars: _envVars, ...rest } = sandbox;
	return rest;
};

export const sandboxRouter = createTRPCRouter({
	templates: protectedProcedure.query(() =>
		Object.entries(SANDBOX_TEMPLATES).map(([name, template]) => ({
			name,
			...template,
		})),
	),

	create: protectedProcedure
		.input(apiCreateSandbox)
		.mutation(async ({ input, ctx }) => {
			const environment = await findEnvironmentById(input.environmentId);
			const project = await findProjectById(environment.projectId);
			await checkServiceAccess(ctx, project.projectId, "create");

			if (project.organizationId !== ctx.session.activeOrganizationId) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You are not authorized to access this project",
				});
			}

			const webServerSettings = await getWebServerSettings();
			if (
				(IS_CLOUD || webServerSettings?.remoteServersOnly) &&
				!input.serverId
			) {
				throw new TRPCError({
					code: "UNAUTHORIZED",
					message: "You need to use a server to create a sandbox",
				});
			}

			if (input.serverId) {
				const accessibleIds = await getAccessibleServerIds(ctx.session);
				if (!accessibleIds.has(input.serverId)) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You are not authorized to access this server",
					});
				}
			}

			const sandbox = await createSandbox(input);
			await addNewService(ctx, sandbox.sandboxId);
			await audit(ctx, {
				action: "create",
				resourceType: "sandbox",
				resourceId: sandbox.sandboxId,
				resourceName: sandbox.name,
			});
			return stripSecrets(sandbox);
		}),

	one: protectedProcedure
		.input(apiFindOneSandbox)
		.query(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "read");
			return stripSecrets(sandbox);
		}),

	list: protectedProcedure
		.input(apiListSandboxes)
		.query(async ({ input, ctx }) => {
			let sandboxes: Awaited<ReturnType<typeof findSandboxesByEnvironmentId>>;
			if (input.environmentId) {
				await checkEnvironmentAccess(ctx, input.environmentId, "read");
				const environment = await findEnvironmentById(input.environmentId);
				if (
					environment.project.organizationId !==
					ctx.session.activeOrganizationId
				) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
				sandboxes = await findSandboxesByEnvironmentId(input.environmentId);
			} else {
				const project = await findProjectById(input.projectId ?? "");
				if (project.organizationId !== ctx.session.activeOrganizationId) {
					throw new TRPCError({ code: "UNAUTHORIZED" });
				}
				if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
					const member = await findMemberByUserId(
						ctx.user.id,
						ctx.session.activeOrganizationId,
					);
					if (!member.accessedProjects.includes(project.projectId)) {
						throw new TRPCError({
							code: "UNAUTHORIZED",
							message: "You don't have access to this project",
						});
					}
				}
				sandboxes = await findSandboxesByProjectId(project.projectId);
			}

			if (ctx.user.role !== "owner" && ctx.user.role !== "admin") {
				const member = await findMemberByUserId(
					ctx.user.id,
					ctx.session.activeOrganizationId,
				);
				sandboxes = sandboxes.filter((sandbox) =>
					member.accessedServices.includes(sandbox.sandboxId),
				);
			}
			return sandboxes.map(stripSecrets);
		}),

	exec: protectedProcedure
		.input(apiExecSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "use");
			const result = await execInSandbox(sandbox, {
				cmd: input.cmd,
				cwd: input.cwd,
				env: input.env,
				timeoutMs: input.timeoutMs,
			});
			return {
				stdout: result.stdout,
				stderr: result.stderr,
				exitCode: result.exitCode,
				timedOut: result.timedOut,
				truncated: result.truncated,
			};
		}),

	writeFile: protectedProcedure
		.input(apiWriteFileSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "use");
			return writeSandboxFile(sandbox, {
				path: input.path,
				content: Buffer.from(input.content, input.encoding),
				mode: input.mode,
			});
		}),

	readFile: protectedProcedure
		.input(apiReadFileSandbox)
		.query(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "read");
			const file = await readSandboxFile(sandbox, input.path);
			return {
				path: file.path,
				size: file.size,
				encoding: input.encoding,
				content: file.content.toString(input.encoding),
			};
		}),

	listFiles: protectedProcedure
		.input(apiListFilesSandbox)
		.query(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "read");
			return listSandboxFiles(sandbox, input.path);
		}),

	setTimeout: protectedProcedure
		.input(apiSetTimeoutSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "use");
			const updated = await setSandboxTimeout(sandbox, input.timeoutMs);
			await audit(ctx, {
				action: "update",
				resourceType: "sandbox",
				resourceId: sandbox.sandboxId,
				resourceName: sandbox.name,
				metadata: { timeoutMs: input.timeoutMs },
			});
			return updated ? stripSecrets(updated) : null;
		}),

	kill: protectedProcedure
		.input(apiFindOneSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(ctx, input.sandboxId, "use");
			const killed = await killSandbox(sandbox.sandboxId);
			await audit(ctx, {
				action: "stop",
				resourceType: "sandbox",
				resourceId: sandbox.sandboxId,
				resourceName: sandbox.name,
			});
			return killed ? stripSecrets(killed) : null;
		}),

	remove: protectedProcedure
		.input(apiFindOneSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findAccessibleSandbox(
				ctx,
				input.sandboxId,
				"delete",
			);
			await removeSandbox(sandbox.sandboxId);
			await audit(ctx, {
				action: "delete",
				resourceType: "sandbox",
				resourceId: sandbox.sandboxId,
				resourceName: sandbox.name,
			});
			return true;
		}),
});
