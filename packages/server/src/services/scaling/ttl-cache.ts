// Shares one in-flight read per key for a short time. The application page
// polls every few seconds, and against a remote server each Docker read opens
// an SSH session, so several viewers must not multiply them.
export const createTtlCache = <T>(ttlMs: number) => {
	const entries = new Map<string, { expiresAt: number; value: Promise<T> }>();
	return {
		get(key: string, load: () => Promise<T>): Promise<T> {
			const now = Date.now();
			const cached = entries.get(key);
			if (cached && cached.expiresAt > now) return cached.value;

			for (const [entryKey, entry] of entries) {
				if (entry.expiresAt <= now) entries.delete(entryKey);
			}

			const value = load();
			const entry = { expiresAt: now + ttlMs, value };
			entries.set(key, entry);
			value.catch(() => {
				if (entries.get(key) === entry) entries.delete(key);
			});
			return value;
		},
		delete(key: string) {
			entries.delete(key);
		},
	};
};
