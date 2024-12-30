import { db } from "@dokploy/server/db";
import { ai } from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";

export const getAiSettingsByAuthId = async (authId: string) => {
	const aiSettings = await db.query.ai.findFirst({
		where: eq(ai.authId, authId),
	});
	if (!aiSettings) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "AI settings not found for the user",
		});
	}
	return aiSettings;
};

export const saveAiSettings = async (authId: string, settings: any) => {
	return db
		.insert(ai)
		.values({
			authId,
			...settings,
		})
		.onConflictDoUpdate({
			target: ai.authId,
			set: {
				...settings,
			},
		});
};
