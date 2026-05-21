import { statements } from "@dokploy/server/lib/access-control";
import { TRPCError } from "@trpc/server";

const INTERNAL_RESOURCES = ["organization", "invitation", "team", "ac"];

export function validatePermissions(permissions: Record<string, string[]>) {
	for (const [resource, actions] of Object.entries(permissions)) {
		if (INTERNAL_RESOURCES.includes(resource)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Resource "${resource}" is managed internally and cannot be assigned to custom roles`,
			});
		}

		if (!(resource in statements)) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message: `Unknown resource: ${resource}`,
			});
		}

		const validActions = statements[resource as keyof typeof statements];
		for (const action of actions) {
			if (!validActions.includes(action as never)) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Invalid action "${action}" for resource "${resource}". Valid actions: ${validActions.join(", ")}`,
				});
			}
		}
	}
}
