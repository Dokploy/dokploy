import {
	assertCloudHostResolvesPublic,
	type HostnameLookup,
	isBlockedCloudHost,
} from "@dokploy/server/utils/url/network";

type AssertGitProviderUrlOptions = {
	allowPrivateNetwork?: boolean;
	fieldName?: string;
	lookup?: HostnameLookup;
};

const parseProviderBaseUrl = (urlValue: string, fieldName: string) => {
	try {
		return new URL(urlValue);
	} catch {
		throw new Error(`${fieldName} must be a valid URL`);
	}
};

export const assertGitProviderBaseUrlAllowed = async (
	urlValue: string,
	options: AssertGitProviderUrlOptions = {},
) => {
	const fieldName = options.fieldName ?? "Git provider URL";
	const allowPrivateNetwork =
		options.allowPrivateNetwork ?? process.env.IS_CLOUD !== "true";
	const url = parseProviderBaseUrl(urlValue, fieldName);

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

	if (!allowPrivateNetwork) {
		if (isBlockedCloudHost(url.hostname)) {
			throw new Error(`${fieldName} host is not allowed in cloud deployments`);
		}

		await assertCloudHostResolvesPublic(url.hostname, {
			fieldName,
			lookup: options.lookup,
		});
	}

	const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
	return `${url.protocol}//${url.host}${pathname}`;
};
