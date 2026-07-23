import { db } from "@dokploy/server/db";
import {
	type apiCreateExternalUpstream,
	buildExternalUpstreamAppName,
	externalUpstreams,
} from "@dokploy/server/db/schema";
import { getWebServerSettings } from "@dokploy/server/services/web-server-settings";
import { validateExternalUpstreamTargetUrl as validateExternalUpstreamTargetUrlInput } from "@dokploy/server/utils/network/external-upstream";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import type { z } from "zod";
import { validUniqueServerAppName } from "./project";

export type ExternalUpstream = typeof externalUpstreams.$inferSelect;

const getBlockedCidrs = async () => {
	const settings = await getWebServerSettings();
	return settings?.externalUpstreamBlockedCidrs || [];
};

const validateExternalUpstreamServiceTargetUrl = async (targetUrl: string) =>
	validateExternalUpstreamTargetUrlInput({
		targetUrl,
		blockedCidrs: await getBlockedCidrs(),
	});

export const createExternalUpstream = async (
	input: z.infer<typeof apiCreateExternalUpstream>,
) => {
	const appName = buildExternalUpstreamAppName(input.appName);

	const valid = await validUniqueServerAppName(appName);
	if (!valid) {
		throw new TRPCError({
			code: "CONFLICT",
			message: "Service with this 'AppName' already exists",
		});
	}

	const targetUrl = await validateExternalUpstreamServiceTargetUrl(
		input.targetUrl,
	);

	const newExternalUpstream = await db
		.insert(externalUpstreams)
		.values({
			...input,
			appName,
			targetUrl,
		})
		.returning()
		.then((value) => value[0]);

	if (!newExternalUpstream) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating the external upstream",
		});
	}

	return newExternalUpstream;
};

export const findExternalUpstreamById = async (
	externalUpstreamId: string,
) => {
	const result = await db.query.externalUpstreams.findFirst({
		where: eq(
			externalUpstreams.externalUpstreamId,
			externalUpstreamId,
		),
		with: {
			environment: {
				with: {
					project: true,
				},
			},
			domains: true,
			server: true,
		},
	});

	if (!result) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "External Upstream not found",
		});
	}

	return result;
};

export const updateExternalUpstreamById = async (
	externalUpstreamId: string,
	serviceData: Partial<ExternalUpstream>,
) => {
	const { appName, ...rest } = serviceData;
	const nextValues = { ...rest };

	if (serviceData.targetUrl) {
		nextValues.targetUrl = await validateExternalUpstreamServiceTargetUrl(
			serviceData.targetUrl,
		);
	}

	const result = await db
		.update(externalUpstreams)
		.set(nextValues)
		.where(
			eq(externalUpstreams.externalUpstreamId, externalUpstreamId),
		)
		.returning();

	return result[0];
};

export const removeExternalUpstreamById = async (
	externalUpstreamId: string,
) => {
	const result = await db
		.delete(externalUpstreams)
		.where(
			eq(externalUpstreams.externalUpstreamId, externalUpstreamId),
		)
		.returning();

	return result[0];
};
