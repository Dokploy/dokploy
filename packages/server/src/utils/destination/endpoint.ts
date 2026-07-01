import {
	assertCloudHostResolvesPublic,
	type HostnameLookup,
	isBlockedCloudHost,
} from "../url/network";

type DestinationEndpointOptions = {
	allowPrivateNetwork?: boolean;
	fieldName?: string;
	lookup?: HostnameLookup;
};

const resolveAllowPrivateNetwork = (allowPrivateNetwork: boolean | undefined) =>
	allowPrivateNetwork ?? process.env.IS_CLOUD !== "true";

export const normalizeDestinationEndpointUrl = (
	endpoint: string,
	options: Omit<DestinationEndpointOptions, "lookup"> = {},
) => {
	const fieldName = options.fieldName ?? "S3 endpoint";
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	let url: URL;
	try {
		url = new URL(endpoint);
	} catch {
		throw new Error(`${fieldName} must be a valid URL`);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`${fieldName} must use http or https`);
	}

	if (!allowPrivateNetwork && url.protocol !== "https:") {
		throw new Error(`${fieldName} must use https in cloud deployments`);
	}

	if (url.username || url.password) {
		throw new Error(`${fieldName} must not include credentials`);
	}

	if (url.search || url.hash) {
		throw new Error(`${fieldName} must not include query or fragment data`);
	}

	if (url.pathname !== "" && url.pathname !== "/") {
		throw new Error(`${fieldName} must not include a path`);
	}

	if (!allowPrivateNetwork && isBlockedCloudHost(url.hostname)) {
		throw new Error(`${fieldName} host is not allowed in cloud deployments`);
	}

	return url.origin;
};

export const assertDestinationEndpointAllowed = async (
	endpoint: string,
	options: DestinationEndpointOptions = {},
) => {
	const fieldName = options.fieldName ?? "S3 endpoint";
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	const normalizedEndpoint = normalizeDestinationEndpointUrl(endpoint, {
		...options,
		fieldName,
		allowPrivateNetwork,
	});

	if (!allowPrivateNetwork) {
		await assertCloudHostResolvesPublic(new URL(normalizedEndpoint).hostname, {
			fieldName,
			lookup: options.lookup,
		});
	}

	return normalizedEndpoint;
};
