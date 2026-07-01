import {
	assertCloudHostResolvesPublic,
	type HostnameLookup,
	isBlockedCloudHost,
} from "../url/network";

type TrustedOriginOptions = {
	lookup?: HostnameLookup;
};

const TRUSTED_ORIGIN_FIELD_NAME = "Trusted origin";

const parseTrustedOrigin = (origin: string) => {
	try {
		return new URL(origin);
	} catch {
		throw new Error(`${TRUSTED_ORIGIN_FIELD_NAME} must be a valid URL`);
	}
};

export const assertTenantTrustedOriginAllowed = async (
	origin: string,
	options: TrustedOriginOptions = {},
) => {
	const url = parseTrustedOrigin(origin);

	if (url.protocol !== "https:") {
		throw new Error(`${TRUSTED_ORIGIN_FIELD_NAME} must use https`);
	}

	if (url.username || url.password) {
		throw new Error(
			`${TRUSTED_ORIGIN_FIELD_NAME} must not include credentials`,
		);
	}

	if ((url.pathname !== "" && url.pathname !== "/") || url.search || url.hash) {
		throw new Error(
			`${TRUSTED_ORIGIN_FIELD_NAME} must not include path, query, or fragment data`,
		);
	}

	if (isBlockedCloudHost(url.hostname)) {
		throw new Error(`${TRUSTED_ORIGIN_FIELD_NAME} host is not allowed`);
	}

	await assertCloudHostResolvesPublic(url.hostname, {
		fieldName: `${TRUSTED_ORIGIN_FIELD_NAME} host`,
		lookup: options.lookup,
	});

	return url.origin;
};

export const filterTenantTrustedOrigins = async (
	origins: string[],
	options: TrustedOriginOptions = {},
) => {
	const allowed: string[] = [];
	for (const origin of origins) {
		try {
			allowed.push(await assertTenantTrustedOriginAllowed(origin, options));
		} catch {}
	}
	return Array.from(new Set(allowed));
};
