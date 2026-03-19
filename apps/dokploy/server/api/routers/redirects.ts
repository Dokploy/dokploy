import {
	createRedirect,
	findRedirectById,
	removeRedirectById,
	updateRedirectById,
} from "@dokploy/server";
import { checkServicePermissionAndAccess } from "@dokploy/server/services/permission";
import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { audit } from "@/server/api/utils/audit";
import {
	apiCreateRedirect,
	apiFindOneRedirect,
	apiUpdateRedirect,
} from "@/server/db/schema";

export const redirectsRouter = createTRPCRouter({
	create: protectedProcedure
		.input(apiCreateRedirect)
		.mutation(async ({ input, ctx }) => {
			await checkServicePermissionAndAccess(ctx, input.applicationId, {
				service: ["create"],
			});
			await createRedirect(input);
			await audit(ctx, {
				action: "create",
				resourceType: "redirect",
				resourceId: input.applicationId,
				resourceName: input.regex,
			});
			return true;
		}),

	one: protectedProcedure
		.input(apiFindOneRedirect)
		.query(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			await checkServicePermissionAndAccess(ctx, redirect.applicationId, {
				service: ["read"],
			});
			return redirect;
		}),

	delete: protectedProcedure
		.input(apiFindOneRedirect)
		.mutation(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			await checkServicePermissionAndAccess(ctx, redirect.applicationId, {
				service: ["delete"],
			});
			const result = await removeRedirectById(input.redirectId);
			await audit(ctx, {
				action: "delete",
				resourceType: "redirect",
				resourceId: input.redirectId,
			});
			return result;
		}),

	update: protectedProcedure
		.input(apiUpdateRedirect)
		.mutation(async ({ input, ctx }) => {
			const redirect = await findRedirectById(input.redirectId);
			await checkServicePermissionAndAccess(ctx, redirect.applicationId, {
				service: ["create"],
			});
			const result = await updateRedirectById(input.redirectId, input);
			await audit(ctx, {
				action: "update",
				resourceType: "redirect",
				resourceId: input.redirectId,
			});
			return result;
		}),
});
