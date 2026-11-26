export const createSlidingWindowLimiter = ({
	limit,
	windowMs,
	now = Date.now,
}: {
	limit: number;
	windowMs: number;
	now?: () => number;
}) => {
	const hits = new Map<string, number[]>();
	return {
		tryConsume(key: string) {
			const at = now();
			const recent = (hits.get(key) ?? []).filter((t) => at - t < windowMs);
			if (recent.length >= limit) {
				hits.set(key, recent);
				return false;
			}
			recent.push(at);
			hits.set(key, recent);
			return true;
		},
	};
};
