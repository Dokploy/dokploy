import { getDokployUrl } from "@dokploy/server/services/admin";
import { execAsyncRemote } from "@dokploy/server/utils/process/execAsync";

export const getRemotePublicIp = async (
	serverId: string,
): Promise<string | null> => {
	try {
		const dokployUrl = await getDokployUrl();
		const { stdout } = await execAsyncRemote(
			serverId,
			`curl -s --max-time 5 ${dokployUrl}/api/public-ip`,
		);
		const parsed = JSON.parse(stdout.trim()) as { ip?: string };
		const ip = parsed.ip?.trim() ?? "";
		if (/^[\d.:a-f]+$/i.test(ip) && ip.length > 0) {
			return ip;
		}
		return null;
	} catch {
		return null;
	}
};

export const isPrivateIp = (ip: string): boolean => {
	if (!ip) return false;
	return (
		/^10\./.test(ip) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
		/^192\.168\./.test(ip) ||
		/^127\./.test(ip) ||
		/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
		ip === "::1" ||
		/^f[cd][0-9a-f]{2}:/i.test(ip)
	);
};
