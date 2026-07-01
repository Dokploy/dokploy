import { lookup as lookupHost } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";

export type HostAddress = {
	address: string;
	family: number;
};

export type HostnameLookup = (hostname: string) => Promise<HostAddress[]>;

export type ResolvedPublicHost = {
	hostname: string;
	addresses: HostAddress[];
};

export const normalizeHostname = (hostname: string) =>
	hostname
		.replace(/^\[|\]$/g, "")
		.replace(/\.$/, "")
		.toLowerCase();

const isBlockedHostname = (hostname: string) => {
	if (!hostname.includes(".")) {
		return true;
	}

	const blockedSuffixes = [
		".corp",
		".home",
		".internal",
		".lan",
		".local",
		".localhost",
	];

	return (
		hostname === "localhost" ||
		blockedSuffixes.some((suffix) => hostname.endsWith(suffix))
	);
};

const parseIPv4Parts = (hostname: string) => {
	const parts = hostname.split(".").map((part) => Number(part));
	if (
		parts.length !== 4 ||
		parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
	) {
		return null;
	}

	return parts;
};

const isBlockedIPv4 = (hostname: string) => {
	const parts = parseIPv4Parts(hostname);
	if (!parts) {
		return false;
	}

	const [first = 0, second = 0, third = 0] = parts;
	return (
		first === 0 ||
		first === 10 ||
		first === 127 ||
		first >= 224 ||
		(first === 100 && second >= 64 && second <= 127) ||
		(first === 169 && second === 254) ||
		(first === 172 && second >= 16 && second <= 31) ||
		(first === 192 && second === 168) ||
		(first === 192 && second === 0 && third === 0) ||
		(first === 192 && second === 0 && third === 2) ||
		(first === 198 && (second === 18 || second === 19)) ||
		(first === 198 && second === 51 && third === 100) ||
		(first === 203 && second === 0 && third === 113)
	);
};

const isBlockedIPv6 = (hostname: string) => {
	const lowerHostname = hostname.toLowerCase();
	const firstHextet = lowerHostname.split(":")[0] ?? "";
	const firstHextetValue = Number.parseInt(firstHextet, 16);
	const isLinkLocal =
		Number.isInteger(firstHextetValue) &&
		(firstHextetValue & 0xffc0) === 0xfe80;
	const isSiteLocal =
		Number.isInteger(firstHextetValue) &&
		(firstHextetValue & 0xffc0) === 0xfec0;
	const isIpv4TranslationPrefix =
		lowerHostname.startsWith("64:ff9b:") ||
		lowerHostname.startsWith("64:ff9b::") ||
		lowerHostname.startsWith("64:ff9b:1:") ||
		lowerHostname.startsWith("2002:") ||
		lowerHostname.startsWith("2001:0:") ||
		lowerHostname.startsWith("2001:0000:");

	return (
		lowerHostname === "::" ||
		lowerHostname === "::1" ||
		lowerHostname.startsWith("::ffff:") ||
		lowerHostname.startsWith("2001:db8:") ||
		isIpv4TranslationPrefix ||
		isLinkLocal ||
		isSiteLocal ||
		firstHextet.startsWith("fc") ||
		firstHextet.startsWith("fd") ||
		firstHextet.startsWith("ff")
	);
};

export const isBlockedCloudHost = (hostname: string) => {
	const normalizedHostname = normalizeHostname(hostname);
	const ipVersion = isIP(normalizedHostname);
	if (ipVersion === 4) {
		return isBlockedIPv4(normalizedHostname);
	}
	if (ipVersion === 6) {
		return isBlockedIPv6(normalizedHostname);
	}
	return isBlockedHostname(normalizedHostname);
};

const defaultLookup: HostnameLookup = async (hostname) =>
	lookupHost(hostname, { all: true, verbatim: true });

export const assertCloudHostResolvesPublic = async (
	hostname: string,
	options: {
		fieldName?: string;
		lookup?: HostnameLookup;
	} = {},
): Promise<ResolvedPublicHost> => {
	const fieldName = options.fieldName ?? "Host";
	const normalizedHostname = normalizeHostname(hostname);
	const ipVersion = isIP(normalizedHostname);

	if (isBlockedCloudHost(normalizedHostname)) {
		throw new Error(`${fieldName} is not allowed in cloud deployments`);
	}

	if (ipVersion) {
		return {
			hostname: normalizedHostname,
			addresses: [{ address: normalizedHostname, family: ipVersion }],
		};
	}

	const lookup = options.lookup ?? defaultLookup;
	let addresses: HostAddress[];
	try {
		addresses = await lookup(normalizedHostname);
	} catch {
		throw new Error(`${fieldName} could not be resolved`);
	}

	if (addresses.length === 0) {
		throw new Error(`${fieldName} could not be resolved`);
	}

	if (addresses.some(({ address }) => isBlockedCloudHost(address))) {
		throw new Error(
			`${fieldName} resolves to a host that is not allowed in cloud deployments`,
		);
	}

	return {
		hostname: normalizedHostname,
		addresses,
	};
};

type FetchInitWithDispatcher = RequestInit & {
	dispatcher?: Agent;
};

type PublicEgressFetchOptions = {
	allowPrivateNetwork?: boolean;
	fieldName?: string;
	lookup?: HostnameLookup;
};

const resolveAllowPrivateNetwork = (allowPrivateNetwork: boolean | undefined) =>
	allowPrivateNetwork ?? process.env.IS_CLOUD !== "true";

const createPinnedPublicHostDispatcher = (resolvedHost: ResolvedPublicHost) => {
	let addressIndex = 0;

	return new Agent({
		connect: {
			lookup(hostname, _options, callback) {
				const normalizedLookupHostname = normalizeHostname(String(hostname));
				if (normalizedLookupHostname !== resolvedHost.hostname) {
					callback(
						new Error(
							"Outbound request attempted to resolve an unvalidated host",
						),
						"",
						4,
					);
					return;
				}

				const address =
					resolvedHost.addresses[addressIndex % resolvedHost.addresses.length];
				addressIndex += 1;
				if (!address) {
					callback(
						new Error("No validated address available for outbound host"),
						"",
						4,
					);
					return;
				}

				callback(null, address.address, address.family === 6 ? 6 : 4);
			},
		},
	});
};

export const fetchWithPublicEgress = async (
	input: RequestInfo | URL,
	init: RequestInit = {},
	options: PublicEgressFetchOptions = {},
) => {
	const allowPrivateNetwork = resolveAllowPrivateNetwork(
		options.allowPrivateNetwork,
	);
	if (allowPrivateNetwork) {
		return fetch(input, init);
	}

	const fieldName = options.fieldName ?? "Outbound URL";
	let url: URL;
	try {
		url = new URL(input instanceof Request ? input.url : input.toString());
	} catch {
		throw new Error(`${fieldName} must be a valid URL`);
	}

	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new Error(`${fieldName} must use http or https`);
	}

	if (url.protocol !== "https:") {
		throw new Error(`${fieldName} must use https in cloud deployments`);
	}

	if (url.username || url.password) {
		throw new Error(`${fieldName} must not include credentials`);
	}

	if (url.hash) {
		throw new Error(`${fieldName} must not include fragment data`);
	}

	const resolvedHost = await assertCloudHostResolvesPublic(url.hostname, {
		fieldName,
		lookup: options.lookup,
	});
	const dispatcher = createPinnedPublicHostDispatcher(resolvedHost);

	try {
		const response = await fetch(input, {
			...init,
			dispatcher,
		} as FetchInitWithDispatcher);
		const body = await response.arrayBuffer();

		return new Response(body.byteLength === 0 ? null : body, {
			headers: response.headers,
			status: response.status,
			statusText: response.statusText,
		});
	} finally {
		await dispatcher.close().catch(() => undefined);
	}
};
