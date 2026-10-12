import { BlockList, isIP } from "node:net";
import { IS_CLOUD } from "@dokploy/server/constants";

export const LOG_PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

const metadataAddresses = new BlockList();
metadataAddresses.addSubnet("169.254.0.0", 16, "ipv4");
metadataAddresses.addSubnet("fe80::", 10, "ipv6");
metadataAddresses.addAddress("fd00:ec2::254", "ipv6");

const privateAddresses = new BlockList();
privateAddresses.addSubnet("0.0.0.0", 8, "ipv4");
privateAddresses.addSubnet("127.0.0.0", 8, "ipv4");
privateAddresses.addSubnet("10.0.0.0", 8, "ipv4");
privateAddresses.addSubnet("100.64.0.0", 10, "ipv4");
privateAddresses.addSubnet("172.16.0.0", 12, "ipv4");
privateAddresses.addSubnet("192.168.0.0", 16, "ipv4");
privateAddresses.addAddress("::", "ipv6");
privateAddresses.addAddress("::1", "ipv6");
privateAddresses.addSubnet("fc00::", 7, "ipv6");

const isBlockedAddress = (address: string): boolean => {
	const ip = address.replace(/^\[|\]$/g, "");
	const family = isIP(ip);
	if (family === 0) {
		return IS_CLOUD && ip.toLowerCase() === "localhost";
	}
	const type = family === 4 ? "ipv4" : "ipv6";
	return (
		metadataAddresses.check(ip, type) ||
		(IS_CLOUD && privateAddresses.check(ip, type))
	);
};

const METADATA_HOSTNAMES = new Set([
	"metadata.google.internal",
	"metadata.goog",
]);

const assertNotBlockedEndpoint = async (rawUrl: string): Promise<void> => {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return;
	}
	const blocked = () =>
		new Error(
			"This endpoint resolves to a blocked address (cloud metadata or private network) and can't be used here.",
		);
	if (METADATA_HOSTNAMES.has(url.hostname.toLowerCase())) {
		throw blocked();
	}
	if (isBlockedAddress(url.hostname)) {
		throw blocked();
	}
	let results: Array<{ address: string }>;
	try {
		const { lookup } = await import("node:dns/promises");
		results = await lookup(url.hostname, { all: true });
	} catch {
		return;
	}
	if (results.some((r) => isBlockedAddress(r.address))) {
		throw blocked();
	}
};

export const logProviderFetch = async (url: string, init: RequestInit = {}) => {
	await assertNotBlockedEndpoint(url);
	return await fetch(url, {
		...init,
		redirect: "error",
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
