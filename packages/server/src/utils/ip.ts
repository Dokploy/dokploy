export const isPrivateIp = (ip: string): boolean => {
	if (!ip) return false;
	return (
		/^10\./.test(ip) ||
		/^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
		/^192\.168\./.test(ip) ||
		/^127\./.test(ip) ||
		ip === "::1"
	);
};
