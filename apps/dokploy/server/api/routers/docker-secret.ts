import {
	assertServerAccess,
	countSwarmSecrets,
	createSwarmSecret,
	getSwarmSecretManager,
	listSwarmSecrets,
	removeSwarmSecret,
	SWARM_SECRET_MAX_BYTES,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../trpc";
import { audit } from "../utils/audit";
import {
	getSecretAccessMethod,
	lockSwarmSecrets,
	requireSwarmSecretAccess,
	unlockSwarmSecrets,
} from "../utils/swarm-secret-access";

const serverInput = z.object({ serverId: z.string().min(1).optional() });
const accessInput = serverInput.extend({
	token: z.string().regex(/^[a-f0-9]{64}$/),
});

// Match the existing host-level Docker permission and assigned-server checks.
const secretProcedure = withPermission("docker", "read").use(
	async ({ ctx, next }) => {
		if (
			!ctx.session.id ||
			ctx.req.headers["x-api-key"] ||
			ctx.session.impersonatedBy
		) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "Sign in with your own account to manage Swarm secrets.",
			});
		}
		const result = await next();
		if (!result.ok && result.error.code === "INTERNAL_SERVER_ERROR") {
			// Database and transport errors can include request details. Keep them off the wire.
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message:
					"Could not manage Swarm secrets. Check the server connection and try again.",
			});
		}
		return result;
	},
);

const scopedProcedure = secretProcedure
	.input(serverInput)
	.use(async ({ ctx, input, next }) => {
		await assertServerAccess(ctx.session, input.serverId ?? null);
		return next({
			ctx: {
				secretScope: {
					userId: ctx.user.id,
					sessionId: ctx.session.id,
					organizationId: ctx.session.activeOrganizationId,
					serverId: input.serverId,
				},
			},
		});
	});

const unlockedProcedure = scopedProcedure
	.input(accessInput)
	.use(async ({ ctx, input, next }) => {
		await requireSwarmSecretAccess(ctx.secretScope, input.token);
		return next();
	});

export const dockerSecretRouter = createTRPCRouter({
	// The overview needs a count only. Names and references still require verification.
	count: scopedProcedure.query(async ({ input }) =>
		countSwarmSecrets(input.serverId),
	),
	status: scopedProcedure.query(async ({ ctx, input }) => {
		try {
			await getSwarmSecretManager(input.serverId);
		} catch (error) {
			if (error instanceof TRPCError) throw error;
			throw new TRPCError({
				code: "INTERNAL_SERVER_ERROR",
				message: "Could not connect to Docker on this server.",
			});
		}
		return { method: await getSecretAccessMethod(ctx.user.id) };
	}),
	unlock: scopedProcedure
		.input(z.object({ credential: z.string().min(1).max(1024) }))
		.mutation(async ({ ctx, input }) =>
			unlockSwarmSecrets(
				ctx.secretScope,
				ctx.req.headers.cookie ?? "",
				input.credential,
			),
		),
	lock: scopedProcedure.mutation(async ({ ctx }) =>
		lockSwarmSecrets(ctx.secretScope),
	),
	// POST keeps access tokens out of URLs, caches, and browser history.
	list: unlockedProcedure.mutation(async ({ input }) =>
		listSwarmSecrets(input.serverId),
	),
	create: unlockedProcedure
		.input(
			z.object({
				name: z
					.string()
					.min(1)
					.max(64)
					.regex(
						/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/,
						"Use letters, numbers, dots, underscores, or hyphens, starting with a letter or number.",
					),
				value: z
					.string()
					.min(1)
					.max(SWARM_SECRET_MAX_BYTES)
					.refine(
						(value) =>
							Buffer.byteLength(value, "utf8") <= SWARM_SECRET_MAX_BYTES,
						"Secret must be less than 500 KiB (maximum 511,999 UTF-8 bytes).",
					),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			const result = await createSwarmSecret(
				input.name,
				input.value,
				input.serverId,
			);
			await audit(ctx, {
				action: "create",
				resourceType: "docker",
				resourceId: result.id,
				resourceName: input.name,
				metadata: { kind: "swarm-secret", serverId: input.serverId ?? null },
			});
			return result;
		}),
	remove: unlockedProcedure
		.input(
			z.object({
				secretId: z.string().regex(/^[a-z0-9]{25}$/, "Invalid secret ID."),
				confirmationName: z.string().min(1).max(64),
			}),
		)
		.mutation(async ({ ctx, input }) => {
			await removeSwarmSecret(
				input.secretId,
				input.confirmationName,
				input.serverId,
			);
			await audit(ctx, {
				action: "delete",
				resourceType: "docker",
				resourceId: input.secretId,
				metadata: { kind: "swarm-secret", serverId: input.serverId ?? null },
			});
		}),
});
