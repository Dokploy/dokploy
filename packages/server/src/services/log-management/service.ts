import { db } from "@dokploy/server/db";
import {
	type apiCreateLogProvider,
	logProvider,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import type { z } from "zod";
import { getLogProviderAdapter } from "./providers/registry";
import type { LogProviderRuntimeConfig, LogProviderType } from "./types";

export type LogProvider = typeof logProvider.$inferSelect;

const CREDENTIAL_COLUMNS = {
	endpoint: false,
	apiKey: false,
	apiSecret: false,
} as const;

const assertRequiredCredentialFields = (
	providerType: LogProviderType,
	values: {
		endpoint?: string | null;
		apiKey?: string | null;
		apiSecret?: string | null;
		extraConfig?: Record<string, unknown> | null;
	},
) => {
	const adapter = getLogProviderAdapter(providerType);
	const fieldValues: Record<string, unknown> = {
		...(values.extraConfig ?? {}),
		endpoint: values.endpoint,
		apiKey: values.apiKey,
		apiSecret: values.apiSecret,
	};
	const missing = adapter.credentialFields
		.filter((field) => field.required)
		.filter((field) => {
			const value = fieldValues[field.key];
			return value === undefined || value === null || value === "";
		})
		.map((field) => field.label);

	if (missing.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `Missing required field(s) for ${adapter.label}: ${missing.join(", ")}`,
		});
	}

	if (adapter.validateConfig) {
		try {
			adapter.validateConfig({
				logProviderId: "validate",
				name: "",
				endpoint: values.endpoint ?? null,
				apiKey: values.apiKey ?? null,
				apiSecret: values.apiSecret ?? null,
				extraConfig: values.extraConfig ?? null,
			});
		} catch (error) {
			throw new TRPCError({
				code: "BAD_REQUEST",
				message:
					error instanceof Error ? error.message : "Invalid configuration",
			});
		}
	}
};

export const createLogProvider = async (
	input: z.infer<typeof apiCreateLogProvider>,
	organizationId: string,
) => {
	assertRequiredCredentialFields(input.providerType, input);

	const created = await db
		.insert(logProvider)
		.values({
			...input,
			organizationId,
		})
		.returning()
		.then((rows) => rows[0]);

	if (!created) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating log provider",
		});
	}
	return created;
};

export const updateLogProvider = async (
	logProviderId: string,
	data: Partial<z.infer<typeof apiCreateLogProvider>>,
) => {
	const existing = await findLogProviderByIdWithCredentials(logProviderId);
	const isChangingType =
		data.providerType !== undefined &&
		data.providerType !== existing.providerType;
	const dataToApply = isChangingType
		? {
				endpoint: null,
				apiKey: null,
				apiSecret: null,
				extraConfig: null,
				...data,
			}
		: data.extraConfig != null
			? {
					...data,
					extraConfig: { ...(existing.extraConfig ?? {}), ...data.extraConfig },
				}
			: data;
	const merged = { ...existing, ...dataToApply };
	assertRequiredCredentialFields(merged.providerType, merged);

	const updated = await db
		.update(logProvider)
		.set(dataToApply)
		.where(eq(logProvider.logProviderId, logProviderId))
		.returning()
		.then((rows) => rows[0]);

	if (!updated) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Log provider not found",
		});
	}
	return updated;
};

export const removeLogProvider = async (logProviderId: string) => {
	const removed = await db
		.delete(logProvider)
		.where(eq(logProvider.logProviderId, logProviderId))
		.returning()
		.then((rows) => rows[0]);

	if (!removed) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Log provider not found",
		});
	}
	return removed;
};

export const findLogProviderById = async (logProviderId: string) => {
	const found = await db.query.logProvider.findFirst({
		where: eq(logProvider.logProviderId, logProviderId),
		columns: CREDENTIAL_COLUMNS,
	});
	if (!found) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Log provider not found",
		});
	}
	return found;
};

export const findLogProviderByIdWithCredentials = async (
	logProviderId: string,
) => {
	const found = await db.query.logProvider.findFirst({
		where: eq(logProvider.logProviderId, logProviderId),
	});
	if (!found) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Log provider not found",
		});
	}
	return found;
};

export const findLogProvidersByOrganization = async (
	organizationId: string,
) => {
	return await db.query.logProvider.findMany({
		where: eq(logProvider.organizationId, organizationId),
		columns: CREDENTIAL_COLUMNS,
	});
};

export const findEnabledLogProvidersByOrganization = async (
	organizationId: string,
) => {
	return await db.query.logProvider.findMany({
		where: and(
			eq(logProvider.organizationId, organizationId),
			eq(logProvider.enabled, true),
		),
	});
};

export const hasEnabledLogProvider = async (organizationId: string) => {
	const found = await db.query.logProvider.findFirst({
		where: and(
			eq(logProvider.organizationId, organizationId),
			eq(logProvider.enabled, true),
		),
		columns: { logProviderId: true },
	});
	return !!found;
};

export const toRuntimeConfig = (
	provider: LogProvider,
): LogProviderRuntimeConfig => ({
	logProviderId: provider.logProviderId,
	name: provider.name,
	endpoint: provider.endpoint,
	apiKey: provider.apiKey,
	apiSecret: provider.apiSecret,
	extraConfig: provider.extraConfig,
});

export const testLogProviderConnection = async (
	params:
		| { logProviderId: string }
		| { providerType: LogProviderType; config: LogProviderRuntimeConfig },
) => {
	let providerType: LogProviderType;
	let runtimeConfig: LogProviderRuntimeConfig;

	if ("logProviderId" in params) {
		const provider = await findLogProviderByIdWithCredentials(
			params.logProviderId,
		);
		providerType = provider.providerType;
		runtimeConfig = toRuntimeConfig(provider);
	} else {
		providerType = params.providerType;
		runtimeConfig = params.config;
	}

	const adapter = getLogProviderAdapter(providerType);
	if (!adapter.testConnection) {
		return {
			success: true,
			warning: "This provider does not support connection testing",
		};
	}

	try {
		await adapter.testConnection(runtimeConfig);
		return { success: true };
	} catch (error) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				error instanceof Error ? error.message : "Connection test failed",
		});
	}
};

export const sanitizeLogProvider = <
	T extends { endpoint?: unknown; apiKey?: unknown; apiSecret?: unknown },
>(
	provider: T,
) => {
	const { endpoint, apiKey, apiSecret, ...rest } = provider;
	return rest;
};
