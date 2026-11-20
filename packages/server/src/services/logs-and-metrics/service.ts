import { db } from "@dokploy/server/db";
import {
	type apiCreateTelemetryProvider,
	server,
	telemetryProvider,
	webServerSettings,
} from "@dokploy/server/db/schema";
import { TRPCError } from "@trpc/server";
import { and, arrayContains, eq, sql } from "drizzle-orm";
import type { z } from "zod";
import { getTelemetryProviderAdapter } from "./providers/registry";
import {
	TELEMETRY_SIGNALS,
	type TelemetryProviderRuntimeConfig,
	type TelemetryProviderType,
	type TelemetrySignal,
} from "./types";

export type TelemetryProvider = typeof telemetryProvider.$inferSelect;

const CREDENTIAL_COLUMNS = {
	endpoint: false,
	apiKey: false,
	apiSecret: false,
} as const;

const sortSignals = (signals: TelemetrySignal[]) =>
	TELEMETRY_SIGNALS.filter((signal) => signals.includes(signal));

export const assertSignalsSupported = (
	providerType: TelemetryProviderType,
	signals: TelemetrySignal[],
) => {
	const adapter = getTelemetryProviderAdapter(providerType);
	if (new Set(signals).size !== signals.length) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "A signal can only be selected once",
		});
	}
	const unsupported = signals.filter((s) => !adapter.signals.includes(s));
	if (unsupported.length > 0) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: `${adapter.label} cannot send ${unsupported.join(", ")}`,
		});
	}
};

export const assertRequiredCredentialFields = (
	providerType: TelemetryProviderType,
	signals: TelemetrySignal[],
	values: {
		endpoint?: string | null;
		apiKey?: string | null;
		apiSecret?: string | null;
		extraConfig?: Record<string, unknown> | null;
	},
) => {
	const adapter = getTelemetryProviderAdapter(providerType);
	const fieldValues: Record<string, unknown> = {
		...(values.extraConfig ?? {}),
		endpoint: values.endpoint,
		apiKey: values.apiKey,
		apiSecret: values.apiSecret,
	};
	const missing = adapter.credentialFields
		.filter((field) => !field.signal || signals.includes(field.signal))
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
				telemetryProviderId: "validate",
				name: "",
				signals,
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

export const createTelemetryProvider = async (
	input: z.infer<typeof apiCreateTelemetryProvider>,
	organizationId: string,
) => {
	assertSignalsSupported(input.providerType, input.signals);
	assertRequiredCredentialFields(input.providerType, input.signals, input);

	const created = await db
		.insert(telemetryProvider)
		.values({
			...input,
			signals: sortSignals(input.signals),
			organizationId,
		})
		.returning()
		.then((rows) => rows[0]);

	if (!created) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message: "Error creating provider",
		});
	}
	return created;
};

// null is the Dokploy host.
export type VectorTarget = string | null;

const findTargetsUsingProvider = async (
	telemetryProviderId: string,
): Promise<VectorTarget[]> => {
	const [servers, local] = await Promise.all([
		db.query.server.findMany({
			where: arrayContains(server.telemetryProviderIds, [telemetryProviderId]),
			columns: { serverId: true },
		}),
		db.query.webServerSettings.findFirst({
			where: arrayContains(webServerSettings.telemetryProviderIds, [
				telemetryProviderId,
			]),
			columns: { id: true },
		}),
	]);
	return [...servers.map((s) => s.serverId), ...(local ? [null] : [])];
};

const SHIPPING_FIELDS = [
	"providerType",
	"enabled",
	"endpoint",
	"apiKey",
	"apiSecret",
	"extraConfig",
	"signals",
] as const;

export const updateTelemetryProvider = async (
	telemetryProviderId: string,
	data: Partial<z.infer<typeof apiCreateTelemetryProvider>>,
) => {
	const existing =
		await findTelemetryProviderByIdWithCredentials(telemetryProviderId);
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
	const signals = merged.signals as TelemetrySignal[];
	assertSignalsSupported(merged.providerType, signals);
	assertRequiredCredentialFields(merged.providerType, signals, merged);
	if (dataToApply.signals) {
		dataToApply.signals = sortSignals(dataToApply.signals);
	}

	const updated = await db
		.update(telemetryProvider)
		.set(dataToApply)
		.where(eq(telemetryProvider.telemetryProviderId, telemetryProviderId))
		.returning()
		.then((rows) => rows[0]);

	if (!updated) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Provider not found",
		});
	}
	const shippingChanged = SHIPPING_FIELDS.some(
		(field) =>
			field in dataToApply &&
			JSON.stringify(dataToApply[field]) !== JSON.stringify(existing[field]),
	);
	return {
		provider: updated,
		targets: shippingChanged
			? await findTargetsUsingProvider(telemetryProviderId)
			: [],
	};
};

export const removeTelemetryProvider = async (telemetryProviderId: string) => {
	return await db.transaction(async (tx) => {
		const removed = await tx
			.delete(telemetryProvider)
			.where(eq(telemetryProvider.telemetryProviderId, telemetryProviderId))
			.returning()
			.then((rows) => rows[0]);

		if (!removed) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Provider not found",
			});
		}

		const servers = await tx
			.update(server)
			.set({
				telemetryProviderIds: sql`array_remove(${server.telemetryProviderIds}, ${telemetryProviderId})`,
			})
			.where(arrayContains(server.telemetryProviderIds, [telemetryProviderId]))
			.returning({ serverId: server.serverId });

		const local = await tx
			.update(webServerSettings)
			.set({
				telemetryProviderIds: sql`array_remove(${webServerSettings.telemetryProviderIds}, ${telemetryProviderId})`,
				vectorAgentOrganizationId: sql`CASE WHEN cardinality(array_remove(${webServerSettings.telemetryProviderIds}, ${telemetryProviderId})) = 0 THEN NULL ELSE ${webServerSettings.vectorAgentOrganizationId} END`,
			})
			.where(
				arrayContains(webServerSettings.telemetryProviderIds, [
					telemetryProviderId,
				]),
			)
			.returning({ id: webServerSettings.id });

		const targets: VectorTarget[] = [
			...servers.map((s) => s.serverId),
			...(local.length > 0 ? [null] : []),
		];
		return { provider: removed, targets };
	});
};

export const findTelemetryProviderForOrganization = async (
	telemetryProviderId: string,
	organizationId: string,
) => {
	const provider = await findTelemetryProviderById(telemetryProviderId);
	if (provider.organizationId !== organizationId) {
		throw new TRPCError({
			code: "UNAUTHORIZED",
			message: "You are not allowed to access this provider",
		});
	}
	return provider;
};

export const findTelemetryProviderById = async (
	telemetryProviderId: string,
) => {
	const found = await db.query.telemetryProvider.findFirst({
		where: eq(telemetryProvider.telemetryProviderId, telemetryProviderId),
		columns: CREDENTIAL_COLUMNS,
	});
	if (!found) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Provider not found",
		});
	}
	return found;
};

export const findTelemetryProviderByIdWithCredentials = async (
	telemetryProviderId: string,
) => {
	const found = await db.query.telemetryProvider.findFirst({
		where: eq(telemetryProvider.telemetryProviderId, telemetryProviderId),
	});
	if (!found) {
		throw new TRPCError({
			code: "NOT_FOUND",
			message: "Provider not found",
		});
	}
	return found;
};

export const findTelemetryProvidersByOrganization = async (
	organizationId: string,
) => {
	return await db.query.telemetryProvider.findMany({
		where: eq(telemetryProvider.organizationId, organizationId),
		columns: CREDENTIAL_COLUMNS,
	});
};

export const findEnabledTelemetryProvidersByOrganization = async (
	organizationId: string,
) => {
	return await db.query.telemetryProvider.findMany({
		where: and(
			eq(telemetryProvider.organizationId, organizationId),
			eq(telemetryProvider.enabled, true),
		),
	});
};

export const toRuntimeConfig = (
	provider: TelemetryProvider,
): TelemetryProviderRuntimeConfig => ({
	telemetryProviderId: provider.telemetryProviderId,
	name: provider.name,
	signals: provider.signals as TelemetrySignal[],
	endpoint: provider.endpoint,
	apiKey: provider.apiKey,
	apiSecret: provider.apiSecret,
	extraConfig: provider.extraConfig,
});

export const testTelemetryProviderConnection = async (
	params:
		| { telemetryProviderId: string; signals?: TelemetrySignal[] }
		| {
				providerType: TelemetryProviderType;
				config: TelemetryProviderRuntimeConfig;
		  },
) => {
	let providerType: TelemetryProviderType;
	let runtimeConfig: TelemetryProviderRuntimeConfig;

	if ("telemetryProviderId" in params) {
		const provider = await findTelemetryProviderByIdWithCredentials(
			params.telemetryProviderId,
		);
		providerType = provider.providerType;
		runtimeConfig = {
			...toRuntimeConfig(provider),
			...(params.signals ? { signals: params.signals } : {}),
		};
	} else {
		providerType = params.providerType;
		runtimeConfig = params.config;
	}

	const adapter = getTelemetryProviderAdapter(providerType);
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

export const sanitizeTelemetryProvider = <
	T extends { endpoint?: unknown; apiKey?: unknown; apiSecret?: unknown },
>(
	provider: T,
) => {
	const { endpoint, apiKey, apiSecret, ...rest } = provider;
	return rest;
};

export const assertProvidersBelongToOrg = async (
	telemetryProviderIds: string[],
	organizationId: string,
) => {
	const providers = await findTelemetryProvidersByOrganization(organizationId);
	const byId = new Map(providers.map((p) => [p.telemetryProviderId, p]));
	for (const id of telemetryProviderIds) {
		const provider = byId.get(id);
		if (!provider) {
			throw new TRPCError({
				code: "UNAUTHORIZED",
				message: "One of the selected providers is not in this organization",
			});
		}
	}
	if (!telemetryProviderIds.some((id) => byId.get(id)?.enabled)) {
		throw new TRPCError({
			code: "BAD_REQUEST",
			message:
				"Select at least one enabled provider — a disabled one ships nothing.",
		});
	}
};
