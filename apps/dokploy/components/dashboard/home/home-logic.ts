export function getScopedServerServiceCount(
	serverId: string,
	servicesByServerId: Readonly<Record<string, number>>,
) {
	return servicesByServerId[serverId] ?? 0;
}
