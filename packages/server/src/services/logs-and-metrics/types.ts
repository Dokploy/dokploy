import type { telemetryProviderType } from "@dokploy/server/db/schema/telemetry-provider";

export type TelemetrySignal = "logs" | "metrics";

export const TELEMETRY_SIGNALS: TelemetrySignal[] = ["logs", "metrics"];

export interface TelemetryProviderCredentialField {
	key: string;
	label: string;
	type: "text" | "password" | "url";
	required: boolean;
	signal?: TelemetrySignal;
	placeholder?: string;
	helpText?: string;
	fullWidth?: boolean;
}

export interface VectorTransformConfig {
	type: string;
	inputs: string[];
	[key: string]: unknown;
}

export interface VectorSinkConfig {
	type: string;
	inputs: string[];
	buffer: {
		type: "disk" | "memory";
		max_size: number;
		when_full?: "block" | "drop_newest";
	};
	[key: string]: unknown;
}

export interface TelemetryProviderRuntimeConfig {
	telemetryProviderId: string;
	name: string;
	signals: TelemetrySignal[];
	endpoint: string | null;
	apiKey: string | null;
	apiSecret: string | null;
	extraConfig: Record<string, unknown> | null;
}

export type TelemetryProviderType =
	(typeof telemetryProviderType.enumValues)[number];

export const DEFAULT_DISK_BUFFER = {
	type: "disk" as const,
	max_size: 268_435_488,
	when_full: "block" as const,
};

export const normalizeEndpointUrl = (endpoint: string): string =>
	!endpoint || /^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;

export const stringValue = (value: unknown): string =>
	typeof value === "string" ? value.trim() : "";

// VRL string literals do not accept JSON's \b, \f or \uXXXX escapes, so control characters are dropped first.
export const vrlString = (value: string): string =>
	// biome-ignore lint/suspicious/noControlCharactersInRegex: that is the point
	JSON.stringify(value.replace(/[\u0000-\u001f\u007f]/g, ""));

export interface TelemetryProviderAdapter {
	type: TelemetryProviderType;
	signals: TelemetrySignal[];
	label: string;
	docsUrl?: string;
	credentialFields: TelemetryProviderCredentialField[];
	toVectorTransform?(
		config: TelemetryProviderRuntimeConfig,
		transformId: string,
		scopeTransformId: string,
		signal: TelemetrySignal,
	): VectorTransformConfig | null;
	toVectorSink(
		config: TelemetryProviderRuntimeConfig,
		sinkId: string,
		inputId: string,
		signal: TelemetrySignal,
	): VectorSinkConfig;
	testConnection?(config: TelemetryProviderRuntimeConfig): Promise<void>;
	validateConfig?(config: TelemetryProviderRuntimeConfig): void;
}
