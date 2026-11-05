import {
	getAccessibleServerIds,
	IS_CLOUD,
	transferService,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import { apiTransferService } from "@/server/db/schema";

export const transferRouter = createTRPCRouter({
	start: protectedProcedure
		.meta({
			openapi: {
				path: "/transfer/start",
				method: "POST",
				override: true,
				enabled: false,
			},
		})
		.input(apiTransferService)
		.subscription(async function* ({ input, ctx, signal }) {
			await checkServicePermissionAndAccess(ctx, input.serviceId, {
				service: ["create"],
				deployment: ["create"],
			});
			if (input.targetServerId) {
				const accessibleIds = await getAccessibleServerIds(ctx.session);
				if (!accessibleIds.has(input.targetServerId)) {
					throw new TRPCError({
						code: "UNAUTHORIZED",
						message: "You don't have access to the target server",
					});
				}
			} else if (IS_CLOUD) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "The Dokploy server is not available as a target",
				});
			}

			const queue: string[] = [];
			let done = false;
			const log = (line: string) => queue.push(line);

			const run = async () => {
				const result = await transferService(
					{
						...input,
						organizationId: ctx.session.activeOrganizationId,
					},
					log,
				);
				await audit(ctx, {
					action: "move",
					resourceType: "service",
					resourceId: input.serviceId,
					resourceName: result.appName,
					metadata: { targetServerId: input.targetServerId },
				});
			};

			run()
				.then(() => log("Transfer completed successfully!"))
				.catch((error) => {
					log(
						`Transfer failed ❌ ${error instanceof Error ? error.message : String(error)}`,
					);
				})
				.finally(() => {
					done = true;
				});

			while (!done || queue.length > 0) {
				if (queue.length > 0) {
					yield queue.shift()!;
				} else {
					await new Promise((r) => setTimeout(r, 50));
				}

				if (signal?.aborted) {
					return;
				}
			}
		}),
});
