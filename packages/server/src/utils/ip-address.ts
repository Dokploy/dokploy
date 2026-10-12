/**
 * Canonical text form of an IP address, so the same address written in
 * different notations compares equal (`2001:0DB8:0:0:0:0:0:50` and
 * `2001:db8::50`). IPv4 and anything that is not a valid IPv6 address is
 * returned trimmed and lowercased.
 */
export const normalizeIp = (ip: string): string => {
	const value = ip.trim().toLowerCase();
	if (!value.includes(":")) {
		return value;
	}
	try {
		return new URL(`http://[${value}]`).hostname.slice(1, -1);
	} catch {
		return value;
	}
};
