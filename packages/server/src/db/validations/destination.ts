export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

export const AZURE_AUTH_PROVIDERS = ["account_key", "sas_url"] as const;
export type AzureAuthProvider = (typeof AZURE_AUTH_PROVIDERS)[number];

export const STORAGE_ACCOUNT_NAME_REQUIRED =
	"Storage Account Name is required when using Account Key";

export const isAzureDestinationType = (value: string | null | undefined) =>
	value === "azure_blob" || value === "az_bs";

export const normalizeDestinationType = (value: unknown) =>
	value === "az_bs" ? "azure_blob" : value;

export const isAzureSasProvider = (provider: string | null | undefined) =>
	provider === "sas_url";

export const isAzureAccountKeyProvider = (
	provider: string | null | undefined,
) => provider === "account_key";

export const looksLikeMissingStorageTarget = (message: string) => {
	const lower = message.toLowerCase();
	return (
		lower.includes("directory not found") || lower.includes("containernotfound")
	);
};

export const normalizeDestinationInput = (val: unknown) => {
	if (!val || typeof val !== "object" || Array.isArray(val)) {
		return val;
	}
	const obj = { ...(val as Record<string, unknown>) };
	if (obj.destinationType === "az_bs") {
		obj.destinationType = "azure_blob";
	}
	if (obj.destinationType == null || obj.destinationType === "") {
		obj.destinationType = "s3";
	}
	return obj;
};

export interface ParsedAzureConnectionString {
	accountName: string;
	accountKey: string;
	endpoint?: string;
}

/**
 * Parses an Azure Storage Connection String into account name, key, and optional custom endpoint.
 */
export const parseAzureConnectionString = (
	connectionString: string,
): ParsedAzureConnectionString => {
	const trimmed = connectionString.trim();
	if (!trimmed) {
		return { accountName: "", accountKey: "" };
	}

	const parts = trimmed.split(";").reduce(
		(acc, part) => {
			const index = part.indexOf("=");
			if (index !== -1) {
				const key = part.slice(0, index).trim();
				const val = part.slice(index + 1).trim();
				if (key) {
					acc[key] = val;
				}
			}
			return acc;
		},
		{} as Record<string, string>,
	);

	const accountName = parts.AccountName || "";
	const accountKey = parts.AccountKey || "";
	let endpoint: string | undefined;

	if (parts.BlobEndpoint) {
		endpoint = parts.BlobEndpoint;
	} else if (
		parts.EndpointSuffix &&
		parts.DefaultEndpointsProtocol &&
		accountName
	) {
		if (parts.EndpointSuffix.toLowerCase() !== "core.windows.net") {
			endpoint = `${parts.DefaultEndpointsProtocol}://${accountName}.blob.${parts.EndpointSuffix}`;
		}
	}

	return {
		accountName,
		accountKey,
		endpoint,
	};
};

/**
 * Extracts container name and account name from a SAS URL if present.
 */
export const parseAzureSasUrl = (
	sasUrl: string,
): { accountName?: string; containerName?: string } => {
	try {
		const url = new URL(sasUrl.trim());
		const hostParts = url.hostname.split(".");
		const accountName = hostParts.length > 0 ? hostParts[0] : undefined;

		const pathSegments = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
		const containerName =
			pathSegments.length > 0 && pathSegments[0] ? pathSegments[0] : undefined;

		return { accountName, containerName };
	} catch {
		return {};
	}
};

export const azureStorageAccountLabel = (input: {
	accessKey?: string | null;
	secretAccessKey: string;
}) =>
	input.accessKey?.trim() ||
	parseAzureSasUrl(input.secretAccessKey).accountName ||
	"this storage account";
