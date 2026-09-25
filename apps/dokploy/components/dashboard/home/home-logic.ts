export const MAX_VISIBLE_SERVERS = 5;

export function getVisibleServers<T>(servers: readonly T[] | undefined) {
	return servers?.slice(0, MAX_VISIBLE_SERVERS) ?? [];
}

export function getScopedServerServiceCount(
	serverId: string,
	servicesByServerId: Readonly<Record<string, number>>,
) {
	return servicesByServerId[serverId] ?? 0;
}
