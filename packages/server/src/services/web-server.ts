import { webServer, type updateWebServerSchema } from "../db/schema";
import { db } from "../db";
import type { z } from "zod";
import { TRPCError } from "@trpc/server";

export const createWebServer = async () => {
	const exists = await findWebServer();
	if (exists) {
		return exists;
	}
	const server = await db?.insert(webServer).values({});
	return server;
};

export const findWebServer = async () => {
	const server = await db?.query.webServer.findFirst();

	if (!server) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Web server not found",
		});
	}
	return server;
};

export const updateWebServer = async (
	input: z.infer<typeof updateWebServerSchema>,
) => {
	const server = await findWebServer();
	if (!server) {
		await createWebServer();
	}
	const updated = await db
		.update(webServer)
		.set({
			...input,
		})
		.returning()
		.then(([updated]) => updated);
	return updated;
};
