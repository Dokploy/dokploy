import { db } from "@dokploy/server/db";
import { type apiCreateRedirect, redirects } from "@dokploy/server/db/schema";
import {
	createRedirectMiddleware,
	removeRedirectMiddleware,
	updateRedirectMiddleware,
} from "@dokploy/server/utils/traefik/redirect";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
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
					message: "Error creating the redirect",
				});
			}

			const application = await findApplicationById(redirect.applicationId);

			createRedirectMiddleware(application, redirect);
		});

		return true;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating this redirect",
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

		await removeRedirectMiddleware(application, response);

		return response;
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error removing this redirect",
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

		await updateRedirectMiddleware(application, redirect);

		return redirect;
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Error updating this redirect";
		throw new TRPCError({
			code: "BAD_REQUEST",
			message,
		});
	}
};
