import {
	type AnyRouter,
	useLocation,
	useParams,
	useSearch,
	useRouter as useTanstackRouter,
} from "@tanstack/react-router";
import { useMemo } from "react";

export type NextUrl =
	| string
	| {
			pathname?: string | null;
			query?: Record<string, unknown> | null;
			hash?: string | null;
	  };

let routerInstance: AnyRouter | null = null;

export const setRouterInstance = (router: AnyRouter) => {
	routerInstance = router;
};

const buildHref = (url: NextUrl, currentPathname: string): string => {
	if (typeof url === "string") {
		if (url.startsWith("?")) return `${currentPathname}${url}`;
		return url;
	}
	const pathname = url.pathname ?? currentPathname;
	const params = new URLSearchParams();
	for (const [key, value] of Object.entries(url.query ?? {})) {
		if (value === undefined || value === null) continue;
		if (Array.isArray(value)) {
			for (const v of value) params.append(key, String(v));
		} else {
			params.set(key, String(value));
		}
	}
	const search = params.toString();
	const hash = url.hash ? `#${url.hash.replace(/^#/, "")}` : "";
	return `${pathname}${search ? `?${search}` : ""}${hash}`;
};

const routerEvents = {
	on: (_event: string, _handler: (...args: unknown[]) => void) => {},
	off: (_event: string, _handler: (...args: unknown[]) => void) => {},
	emit: (_event: string, ..._args: unknown[]) => {},
};

export const useRouter = () => {
	const tanstackRouter = useTanstackRouter();
	const location = useLocation();
	const params = useParams({ strict: false }) as Record<string, string>;
	const search = useSearch({ strict: false }) as Record<string, unknown>;

	return useMemo(() => {
		const pathname = location.pathname;
		return {
			pathname,
			route: pathname,
			asPath: `${pathname}${location.searchStr ?? ""}${location.hash ? `#${location.hash}` : ""}`,
			query: { ...search, ...params } as Record<string, string | string[]>,
			isReady: true,
			events: routerEvents,
			push: (url: NextUrl, _as?: unknown, _options?: unknown) => {
				tanstackRouter.history.push(buildHref(url, pathname));
				return Promise.resolve(true);
			},
			replace: (url: NextUrl, _as?: unknown, _options?: unknown) => {
				tanstackRouter.history.replace(buildHref(url, pathname));
				return Promise.resolve(true);
			},
			back: () => tanstackRouter.history.back(),
			forward: () => tanstackRouter.history.forward(),
			reload: () => window.location.reload(),
			prefetch: (_url: string) => Promise.resolve(),
		};
	}, [
		location.pathname,
		location.searchStr,
		location.hash,
		params,
		search,
		tanstackRouter,
	]);
};

const singletonRouter = {
	push: (url: NextUrl) => {
		if (routerInstance) {
			routerInstance.history.push(buildHref(url, window.location.pathname));
		} else {
			window.location.href = buildHref(url, window.location.pathname);
		}
		return Promise.resolve(true);
	},
	replace: (url: NextUrl) => {
		if (routerInstance) {
			routerInstance.history.replace(buildHref(url, window.location.pathname));
		} else {
			window.location.replace(buildHref(url, window.location.pathname));
		}
		return Promise.resolve(true);
	},
	back: () => window.history.back(),
	reload: () => window.location.reload(),
	events: routerEvents,
};

export default singletonRouter;
