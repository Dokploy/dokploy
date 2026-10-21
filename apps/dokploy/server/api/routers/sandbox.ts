import {
	createSandbox,
	execInSandbox,
	findSandboxById,
	findSandboxesByOrganizationId,
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
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, withPermission } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateSandbox,
	apiExecSandbox,
	apiFindOneSandbox,
	apiListFilesSandbox,
	apiReadFileSandbox,
	apiSetTimeoutSandbox,
	apiWriteFileSandbox,
} from "@/server/db/schema";

const findOrganizationSandbox = async (
	sandboxId: string,
	organizationId: string,
) => {
	const sandbox = await findSandboxById(sandboxId);
	if (sandbox.organizationId !== organizationId) {
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
	templates: withPermission("sandbox", "read").query(() =>
		Object.entries(SANDBOX_TEMPLATES).map(([name, template]) => ({
			name,
			...template,
		})),
	),

	create: withPermission("sandbox", "create")
		.input(apiCreateSandbox)
		.mutation(async ({ input, ctx }) => {
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

			const sandbox = await createSandbox({
				...input,
				organizationId: ctx.session.activeOrganizationId,
			});
			await audit(ctx, {
				action: "create",
				resourceType: "sandbox",
				resourceId: sandbox.sandboxId,
				resourceName: sandbox.name,
			});
			return stripSecrets(sandbox);
		}),

	one: withPermission("sandbox", "read")
		.input(apiFindOneSandbox)
		.query(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
			return stripSecrets(sandbox);
		}),

	list: withPermission("sandbox", "read").query(async ({ ctx }) => {
		const sandboxes = await findSandboxesByOrganizationId(
			ctx.session.activeOrganizationId,
		);
		return sandboxes.map(stripSecrets);
	}),

	exec: withPermission("sandbox", "create")
		.input(apiExecSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
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

	writeFile: withPermission("sandbox", "create")
		.input(apiWriteFileSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
			return writeSandboxFile(sandbox, {
				path: input.path,
				content: Buffer.from(input.content, input.encoding),
				mode: input.mode,
			});
		}),

	readFile: withPermission("sandbox", "read")
		.input(apiReadFileSandbox)
		.query(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
			const file = await readSandboxFile(sandbox, input.path);
			return {
				path: file.path,
				size: file.size,
				encoding: input.encoding,
				content: file.content.toString(input.encoding),
			};
		}),

	listFiles: withPermission("sandbox", "read")
		.input(apiListFilesSandbox)
		.query(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
			return listSandboxFiles(sandbox, input.path);
		}),

	setTimeout: withPermission("sandbox", "create")
		.input(apiSetTimeoutSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
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

	kill: withPermission("sandbox", "create")
		.input(apiFindOneSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
			);
			const killed = await killSandbox(sandbox.sandboxId);
			await audit(ctx, {
				action: "stop",
				resourceType: "sandbox",
				resourceId: sandbox.sandboxId,
				resourceName: sandbox.name,
			});
			return killed ? stripSecrets(killed) : null;
		}),

	remove: withPermission("sandbox", "delete")
		.input(apiFindOneSandbox)
		.mutation(async ({ input, ctx }) => {
			const sandbox = await findOrganizationSandbox(
				input.sandboxId,
				ctx.session.activeOrganizationId,
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
