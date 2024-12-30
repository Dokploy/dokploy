import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { apiAiSettingsSchema } from "@dokploy/server/db/schema/ai";
import {
	getAiSettingsByAuthId,
	saveAiSettings,
} from "@dokploy/server/services/ai";

export const aiRouter = createTRPCRouter({
	save: protectedProcedure
		.input(apiAiSettingsSchema)
		.mutation(async ({ ctx, input }) => {
			return await saveAiSettings(ctx.user.authId, input);
		}),
	get: protectedProcedure.query(async ({ ctx }) => {
		const data = await getAiSettingsByAuthId(ctx.user.authId);
		console.log(data);
		console.log(ctx.user);
		return data;
	}),
});
