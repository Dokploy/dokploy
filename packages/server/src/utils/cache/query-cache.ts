/**
 * Query result caching utilities for database queries
 */

import { nodeCache, serverCache, mountCache } from "./simple-cache";

/**
 * Cache key generators
 */
export const getNodeCacheKey = (nodeId: string, serverId?: string): string => {
	return `node:${nodeId}:${serverId || "local"}`;
};

export const getServerCacheKey = (serverId: string): string => {
	return `server:${serverId}`;
};

export const getMountCacheKey = (mountId: string): string => {
	return `mount:${mountId}`;
};

export const getSwarmNodesCacheKey = (serverId?: string): string => {
	return `swarm:nodes:${serverId || "local"}`;
};

/**
 * Invalidate cache entries
 */
export const invalidateNodeCache = (nodeId: string, serverId?: string): void => {
	nodeCache.delete(getNodeCacheKey(nodeId, serverId));
};

export const invalidateServerCache = (serverId: string): void => {
	serverCache.delete(getServerCacheKey(serverId));
};

export const invalidateMountCache = (mountId: string): void => {
	mountCache.delete(getMountCacheKey(mountId));
};

export const invalidateSwarmNodesCache = (serverId?: string): void => {
	nodeCache.delete(getSwarmNodesCacheKey(serverId));
};

