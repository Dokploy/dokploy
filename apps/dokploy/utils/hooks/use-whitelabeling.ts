import { api } from "@/utils/api";

/**
 * Hook to access whitelabeling config for authenticated pages (dashboard, services, etc.).
 * Requires the user to be logged in.
 */
export function useWhitelabeling() {
	const { data, ...rest } = api.whitelabeling.get.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
	return { config: data ?? null, ...rest };
}

/**
 * Hook to access the public whitelabeling config.
 * Only for unauthenticated pages (login, register, error, invitation, password reset).
 */
export function useWhitelabelingPublic() {
	const { data, ...rest } = api.whitelabeling.getPublic.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
	return { config: data ?? null, ...rest };
}
