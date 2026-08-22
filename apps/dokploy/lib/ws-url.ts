export const buildWsUrl = (path: string, params: URLSearchParams): string => {
	const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
	return `${protocol}//${window.location.host}${path}?${params.toString()}`;
};
