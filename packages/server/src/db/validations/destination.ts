export const ADDITIONAL_FLAG_REGEX = /^--[a-zA-Z0-9-]+(=[a-zA-Z0-9._:/@-]+)?$/;
export const ADDITIONAL_FLAG_ERROR =
	"Invalid flag format. Must start with -- (e.g. --s3-sign-accept-encoding=false)";

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
