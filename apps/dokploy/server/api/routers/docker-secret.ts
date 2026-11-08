import {
	assertServerAccess,
	countSwarmSecrets,
	createSwarmSecret,
	listSwarmSecrets,
	removeSwarmSecret,
	SWARM_SECRET_MAX_BYTES,
} from "@dokploy/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTRPCRouter, withPermission } from "../trpc";
import { audit } from "../utils/audit";

const serverInput = z.object({ serverId: z.string().min(1).optional() });

// Match the existing host-level Docker permission and assigned-server checks.
const scopedProcedure = withPermission("docker", "read")
	.use(async ({ next }) => {
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
	})
	.input(serverInput)
	.use(async ({ ctx, input, next }) => {
		await assertServerAccess(ctx.session, input.serverId ?? null);
		return next();
	});

export const dockerSecretRouter = createTRPCRouter({
	count: scopedProcedure.query(async ({ input }) =>
		countSwarmSecrets(input.serverId),
	),
	list: scopedProcedure.query(async ({ input }) =>
		listSwarmSecrets(input.serverId),
	),
	create: scopedProcedure
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
	remove: scopedProcedure
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
