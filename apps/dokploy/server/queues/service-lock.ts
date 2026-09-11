const locks = new Map<string, Promise<void>>();

export const withServiceLock = async <T>(
	serviceKey: string,
	fn: () => Promise<T>,
): Promise<T> => {
	while (locks.has(serviceKey)) {
		await locks.get(serviceKey);
	}
	let resolve!: () => void;
	const p = new Promise<void>((r) => {
		resolve = r;
	});
	locks.set(serviceKey, p);
	try {
		return await fn();
	} finally {
		locks.delete(serviceKey);
		resolve();
	}
};
