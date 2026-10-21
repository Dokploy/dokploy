import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

export const DEFAULT_EXTERNAL_UPSTREAM_BLOCKED_CIDRS = [
	"127.0.0.0/8",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"169.254.0.0/16",
	"0.0.0.0/8",
	"::1/128",
	"fc00::/7",
	"fe80::/10",
];

const LOCALHOST_HOSTNAMES = new Set(["localhost", "localhost.localdomain"]);

type ResolvedTargetAddress = {
	address: string;
	family: 4 | 6;
};

const addBlockedEntry = (blockList: BlockList, entry: string) => {
	const value = entry.trim();
	if (!value) {
		return;
	}

	if (!value.includes("/")) {
		const family = isIP(value);
		if (family === 4) {
			blockList.addAddress(value, "ipv4");
			return;
		}
		if (family === 6) {
			blockList.addAddress(value, "ipv6");
			return;
		}
		throw new Error(`Invalid blocked address or CIDR: ${entry}`);
	}

	const [network, prefixLengthRaw] = value.split("/");
	const family = network ? isIP(network) : 0;
	const prefixLength = Number.parseInt(prefixLengthRaw || "", 10);

	if (!network || family === 0 || Number.isNaN(prefixLength)) {
		throw new Error(`Invalid blocked address or CIDR: ${entry}`);
	}

	blockList.addSubnet(network, prefixLength, family === 4 ? "ipv4" : "ipv6");
};

export const normalizeBlockedCidrs = (blockedCidrs: string[]) =>
	Array.from(
		new Set(blockedCidrs.map((value) => value.trim()).filter(Boolean)),
	);

export const validateBlockedCidrs = (blockedCidrs: string[]) => {
	const blockList = new BlockList();

	for (const entry of normalizeBlockedCidrs(blockedCidrs)) {
		addBlockedEntry(blockList, entry);
	}
};

const unwrapHostname = (host: string) => {
	const normalizedHost = host.trim().toLowerCase();
	return normalizedHost.startsWith("[") && normalizedHost.endsWith("]")
		? normalizedHost.slice(1, -1)
		: normalizedHost;
};

const parseTargetUrl = (targetUrl: string) => {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(targetUrl);
	} catch {
		throw new Error("Target URL must be a valid URL");
	}

	if (!["http:", "https:"].includes(parsedUrl.protocol)) {
		throw new Error("Target URL must use http:// or https://");
	}

	if (!parsedUrl.hostname) {
		throw new Error("Target URL must include a hostname");
	}

	if (parsedUrl.username || parsedUrl.password) {
		throw new Error("Target URL must not include credentials");
	}

	return parsedUrl;
};

const resolveTargetAddresses = async (
	host: string,
	blockedCidrs: string[],
): Promise<ResolvedTargetAddress[]> => {
	const normalizedHost = host.trim().toLowerCase();
	const unwrappedHost = unwrapHostname(normalizedHost);
	if (
		LOCALHOST_HOSTNAMES.has(normalizedHost) ||
		normalizedHost.endsWith(".localhost")
	) {
		throw new Error("Target URL points to a blocked network range");
	}

	const blockList = new BlockList();
	for (const entry of normalizeBlockedCidrs(blockedCidrs)) {
		addBlockedEntry(blockList, entry);
	}

	const hostFamily = isIP(unwrappedHost);
	let resolvedAddresses: ResolvedTargetAddress[];

	if (hostFamily === 4 || hostFamily === 6) {
		resolvedAddresses = [{ address: unwrappedHost, family: hostFamily }];
	} else {
		try {
			resolvedAddresses = (
				await lookup(unwrappedHost, {
					all: true,
					verbatim: true,
				})
			).map(({ address, family }) => ({
				address,
				family: family === 4 ? 4 : 6,
			}));
		} catch {
			throw new Error("Target URL hostname could not be resolved");
		}
	}

	if (resolvedAddresses.length === 0) {
		throw new Error("Target URL hostname could not be resolved");
	}

	if (
		resolvedAddresses.some((resolved) =>
			blockList.check(
				resolved.address,
				resolved.family === 4 ? "ipv4" : "ipv6",
			),
		)
	) {
		throw new Error("Target URL points to a blocked network range");
	}

	return resolvedAddresses;
};

export const resolveExternalUpstreamTarget = async ({
	targetUrl,
	blockedCidrs,
}: {
	targetUrl: string;
	blockedCidrs: string[];
}) => {
	const parsedUrl = parseTargetUrl(targetUrl);
	const host = unwrapHostname(parsedUrl.hostname);
	const resolvedAddresses = await resolveTargetAddresses(
		parsedUrl.hostname,
		blockedCidrs,
	);

	return {
		urls: resolvedAddresses.map(({ address, family }) => {
			const pinnedUrl = new URL(parsedUrl);
			pinnedUrl.hostname = family === 6 ? `[${address}]` : address;
			return pinnedUrl.toString();
		}),
		hostHeader: parsedUrl.host,
		serverName: isIP(host) === 0 ? host : undefined,
	};
};

export const validateExternalUpstreamTargetUrl = async ({
	targetUrl,
	blockedCidrs,
}: {
	targetUrl: string;
	blockedCidrs: string[];
}) => {
	const parsedUrl = parseTargetUrl(targetUrl);
	await resolveTargetAddresses(parsedUrl.hostname, blockedCidrs);
	return parsedUrl.toString();
};
