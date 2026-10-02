export const LOG_PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

const isMetadataAddress = (address: string): boolean => {
	const lower = address.toLowerCase().replace(/^\[|\]$/g, "");
	if (lower === "fd00:ec2::254") return true;
	if (lower.startsWith("169.254.")) return true;
	if (/^fe[89ab]/.test(lower)) return true;
	return false;
};

const METADATA_HOSTNAMES = new Set([
	"metadata.google.internal",
	"metadata.goog",
]);

const assertNotMetadataEndpoint = async (rawUrl: string): Promise<void> => {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return;
	}
	const blocked = () =>
		new Error(
			"This endpoint resolves to a cloud metadata address and can't be used here.",
		);
	if (METADATA_HOSTNAMES.has(url.hostname.toLowerCase())) {
		throw blocked();
	}
	if (isMetadataAddress(url.hostname)) {
		throw blocked();
	}
	try {
		const { lookup } = await import("node:dns/promises");
		const results = await lookup(url.hostname, { all: true });
		if (results.some((r) => isMetadataAddress(r.address))) {
			throw blocked();
		}
	} catch (error) {
		if (error instanceof Error && error.message.includes("metadata")) {
			throw error;
		}
	}
};

export const logProviderFetch = async (url: string, init: RequestInit = {}) => {
	await assertNotMetadataEndpoint(url);
	return await fetch(url, {
		...init,
		signal: AbortSignal.timeout(LOG_PROVIDER_REQUEST_TIMEOUT_MS),
	});
};

export interface LogProviderCredentialField {
	key: string;
	label: string;
	type: "text" | "password" | "url";
	required: boolean;
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

export interface LogProviderRuntimeConfig {
	logProviderId: string;
	name: string;
	endpoint: string | null;
	apiKey: string | null;
	apiSecret: string | null;
	extraConfig: Record<string, unknown> | null;
}

export type LogProviderType =
	| "loki"
	| "datadog"
	| "betterstack"
	| "elasticsearch"
	| "splunk_hec"
	| "aws_cloudwatch";

export const DEFAULT_DISK_BUFFER = {
	type: "disk" as const,
	max_size: 268_435_488,
	when_full: "block" as const,
};

export const normalizeEndpointUrl = (endpoint: string): string =>
	!endpoint || /^https?:\/\//.test(endpoint) ? endpoint : `https://${endpoint}`;

export interface LogProviderAdapter {
	type: LogProviderType;
	label: string;
	docsUrl?: string;
	credentialFields: LogProviderCredentialField[];
	toVectorTransform?(
		config: LogProviderRuntimeConfig,
		transformId: string,
		scopeTransformId: string,
	): VectorTransformConfig;
	toVectorSink(
		config: LogProviderRuntimeConfig,
		sinkId: string,
		inputId: string,
	): VectorSinkConfig;
	testConnection?(config: LogProviderRuntimeConfig): Promise<void>;
	validateConfig?(config: LogProviderRuntimeConfig): void;
}
