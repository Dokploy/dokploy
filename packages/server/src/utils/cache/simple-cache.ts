/**
 * Simple in-memory cache with TTL support
 */

interface CacheEntry<T> {
	value: T;
	expiresAt: number;
}

export class SimpleCache<T> {
	private cache = new Map<string, CacheEntry<T>>();
	private defaultTTL: number;

	constructor(defaultTTL: number = 60000) {
		// Default TTL: 60 seconds
		this.defaultTTL = defaultTTL;
	}

	/**
	 * Get value from cache
	 */
	get(key: string): T | undefined {
		const entry = this.cache.get(key);

		if (!entry) {
			return undefined;
		}

		// Check if expired
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return undefined;
		}

		return entry.value;
	}

	/**
	 * Set value in cache
	 */
	set(key: string, value: T, ttl?: number): void {
		const expiresAt = Date.now() + (ttl || this.defaultTTL);
		this.cache.set(key, { value, expiresAt });
	}

	/**
	 * Delete value from cache
	 */
	delete(key: string): void {
		this.cache.delete(key);
	}

	/**
	 * Clear all cache entries
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Check if key exists and is not expired
	 */
	has(key: string): boolean {
		const entry = this.cache.get(key);
		if (!entry) {
			return false;
		}

		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return false;
		}

		return true;
	}

	/**
	 * Clean expired entries
	 */
	cleanExpired(): void {
		const now = Date.now();
		for (const [key, entry] of this.cache.entries()) {
			if (now > entry.expiresAt) {
				this.cache.delete(key);
			}
		}
	}

	/**
	 * Get cache size
	 */
	size(): number {
		return this.cache.size;
	}
}

/**
 * Global cache instances for different use cases
 */
export const mountCache = new SimpleCache<any>(300000); // 5 minutes
export const nodeCache = new SimpleCache<any>(60000); // 1 minute
export const serverCache = new SimpleCache<any>(300000); // 5 minutes

/**
 * Cache decorator for async functions
 */
export const cached = <T extends (...args: any[]) => Promise<any>>(
	fn: T,
	keyGenerator: (...args: Parameters<T>) => string,
	ttl?: number,
): T => {
	return (async (...args: Parameters<T>) => {
		const key = keyGenerator(...args);
		const cache = new SimpleCache(ttl || 60000);

		// Try to get from cache
		const cached = cache.get(key);
		if (cached !== undefined) {
			return cached;
		}

		// Execute function and cache result
		const result = await fn(...args);
		cache.set(key, result, ttl);
		return result;
	}) as T;
};

