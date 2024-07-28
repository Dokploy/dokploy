import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "~/server/db";
import { type apiCreateRedirect, redirects } from "~/server/db/schema";
import {
	createRedirectMiddleware,
	removeRedirectMiddleware,
	updateRedirectMiddleware,
} from "~/server/utils/traefik/redirect";
import { findApplicationById } from "./application";
export type Redirect = typeof redirects.$inferSelect;

export const findRedirectById = async (redirectId: string) => {
	const application = await db.query.redirects.findFirst({
		where: eq(redirects.redirectId, redirectId),
	});
	if (!application) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Redirect not found",
		});
	}
	return application;
};

export const createRedirect = async (
	redirectData: z.infer<typeof apiCreateRedirect>,
) => {
	try {
		await db.transaction(async (tx) => {
			const redirect = await tx
				.insert(redirects)
				.values({
					...redirectData,
				})
				.returning()
				.then((res) => res[0]);

			if (!redirect) {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: "Error to create the redirect",
				});
			}

			const application = await findApplicationById(redirect.applicationId);

			createRedirectMiddleware(application.appName, redirect);
		});

		return true;
	} catch (error) {
		console.log(error);
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to create this redirect",
			cause: error,
		});
	}
};

export const removeRedirectById = async (redirectId: string) => {
	try {
		const response = await db
			.delete(redirects)
			.where(eq(redirects.redirectId, redirectId))
			.returning()
			.then((res) => res[0]);

		if (!response) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Redirect not found",
			});
		}

		const application = await findApplicationById(response.applicationId);

		removeRedirectMiddleware(application.appName, response);

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to remove this redirect",
			cause: error,
		});
	}
};

export const updateRedirectById = async (
	redirectId: string,
	redirectData: Partial<Redirect>,
) => {
	try {
		const redirect = await db
			.update(redirects)
			.set({
				...redirectData,
			})
			.where(eq(redirects.redirectId, redirectId))
			.returning()
			.then((res) => res[0]);

		if (!redirect) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Redirect not found",
			});
		}
		const application = await findApplicationById(redirect.applicationId);

		updateRedirectMiddleware(application.appName, redirect);

		return redirect;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error to update this redirect",
		});
	}
};
