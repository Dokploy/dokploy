import {
	useLocation,
	useRouter as useTanstackRouter,
} from "@tanstack/react-router";

export const usePathname = () => {
	return useLocation().pathname;
};

export const useSearchParams = () => {
	const location = useLocation();
	return new URLSearchParams(location.searchStr ?? "");
};

export const useParams = () => {
	return useLocation().pathname;
};

export const useRouter = () => {
	const router = useTanstackRouter();
	return {
		push: (href: string) => router.history.push(href),
		replace: (href: string) => router.history.replace(href),
		back: () => router.history.back(),
		forward: () => router.history.forward(),
		refresh: () => router.invalidate(),
		prefetch: (_href: string) => {},
	};
};
