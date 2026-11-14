import { type LookupAddress, lookup } from "node:dns";
import { BlockList, isIP, type LookupFunction } from "node:net";
import { IS_CLOUD } from "@dokploy/server/constants";
import { Agent } from "undici";

export const PROVIDER_REQUEST_TIMEOUT_MS = 15_000;

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

// BlockList maps ::ffff:a.b.c.d back to IPv4 by itself, but not NAT64
// (64:ff9b::/96) or IPv4-compatible (::/96) addresses, which carry an IPv4
// address in their low 32 bits.
const embeddedIPv4Prefixes = new BlockList();
embeddedIPv4Prefixes.addSubnet("64:ff9b::", 96, "ipv6");
embeddedIPv4Prefixes.addSubnet("::", 96, "ipv6");

const toEmbeddedIPv4 = (ipv6: string): string | null => {
	if (!embeddedIPv4Prefixes.check(ipv6, "ipv6")) {
		return null;
	}
	// The URL parser rewrites a dotted tail ("::1.2.3.4") into hex groups.
	const canonical = new URL(`http://[${ipv6}]`).hostname.slice(1, -1);
	const [head = "", tail = ""] = canonical.split("::");
	const headGroups = head ? head.split(":") : [];
	const tailGroups = tail ? tail.split(":") : [];
	const groups = [
		...headGroups,
		...Array<string>(8 - headGroups.length - tailGroups.length).fill("0"),
		...tailGroups,
	].map((group) => Number.parseInt(group, 16));
	const high = groups[6] ?? 0;
	const low = groups[7] ?? 0;
	return [high >> 8, high & 255, low >> 8, low & 255].join(".");
};

const isBlockedAddress = (address: string): boolean => {
	const ip = address.replace(/^\[|\]$/g, "");
	const family = isIP(ip);
	if (family === 0) {
		return IS_CLOUD && ip.toLowerCase() === "localhost";
	}
	if (family === 6) {
		const embedded = toEmbeddedIPv4(ip);
		if (embedded) {
			return isBlockedAddress(embedded);
		}
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

class BlockedEndpointError extends Error {
	constructor() {
		super(
			"This endpoint resolves to a blocked address (cloud metadata or private network) and can't be used here.",
		);
	}
}

const assertNotBlockedEndpoint = (rawUrl: string): void => {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return;
	}
	if (
		METADATA_HOSTNAMES.has(url.hostname.toLowerCase()) ||
		isBlockedAddress(url.hostname)
	) {
		throw new BlockedEndpointError();
	}
};

// Checks the addresses the socket actually connects to; a separate pre-flight lookup could be answered differently (DNS rebinding).
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
	lookup(hostname, { ...options, all: true }, (error, addresses) => {
		if (error) {
			callback(error, "");
			return;
		}
		const list = addresses as LookupAddress[];
		const first = list[0];
		if (!first) {
			callback(new Error(`No addresses found for ${hostname}`), "");
			return;
		}
		if (list.some((entry) => isBlockedAddress(entry.address))) {
			callback(new BlockedEndpointError(), "");
			return;
		}
		if (options.all) {
			callback(null, list);
		} else {
			callback(null, first.address, first.family);
		}
	});
};

const guardedAgent = new Agent({ connect: { lookup: guardedLookup } });

export const guardedFetch: typeof fetch = async (input, init) => {
	assertNotBlockedEndpoint(
		input instanceof Request ? input.url : String(input),
	);
	try {
		return await fetch(input, {
			...init,
			redirect: "error",
			// @ts-expect-error Node's fetch accepts an undici dispatcher, but lib.dom's RequestInit doesn't declare it.
			dispatcher: guardedAgent,
		});
	} catch (error) {
		if (error instanceof Error && error.cause instanceof BlockedEndpointError) {
			throw error.cause;
		}
		throw error;
	}
};

export const providerFetch = (url: string, init: RequestInit = {}) =>
	guardedFetch(url, {
		...init,
		signal: AbortSignal.timeout(PROVIDER_REQUEST_TIMEOUT_MS),
	});
