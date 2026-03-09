import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

const PUBLIC_IP_SERVICES = [
  "https://api.ipify.org",
  "https://checkip.amazonaws.com",
  "https://ipinfo.io/ip",
] as const;

export const getRemotePublicIp = async (
	serverId: string,
): Promise<string | null> => {
	try {
		const command = PUBLIC_IP_SERVICES.map(
			(s) => `curl -sf --max-time 5 ${s}`,
		).join(" || ");
		const { stdout } = await execAsyncRemote(serverId, command);
		const ip = stdout.trim();
		if (/^[\d.:a-f]+$/i.test(ip) && ip.length > 0 && !isPrivateIp(ip)) {
			return ip;
		}
	} catch (error) {
		console.error(
			`[getRemotePublicIp] Failed to retrieve public IP for server ${serverId}:`,
			error,
		);
		return null;
	}
	return null;
};

export const isPrivateIp = (ip: string): boolean => {
	if (!ip) return false;
	return (
		/^10\./.test(ip) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
		/^192\.168\./.test(ip) ||
		/^127\./.test(ip) ||
		/^169\.254\./.test(ip) || // RFC 3927 link-local
		/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
		ip === "::1" ||
		/^f[cd][0-9a-f]{2}:/i.test(ip)
	);
};
