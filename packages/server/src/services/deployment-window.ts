export const DEPLOYMENT_REPORT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export function getDeploymentWindowBounds(nowMs: number) {
	const last7dStart = new Date(nowMs - DEPLOYMENT_REPORT_WINDOW_MS);

	return {
		last7dStart,
		prev7dStart: new Date(nowMs - 2 * DEPLOYMENT_REPORT_WINDOW_MS),
	};
}
