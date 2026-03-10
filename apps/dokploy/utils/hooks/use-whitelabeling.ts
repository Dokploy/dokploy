import { api } from "@/utils/api";

/**
 * Hook to access the public whitelabeling config.
 * Can be used on any page (including login) since it uses the public endpoint.
 */
export function useWhitelabelingPublic() {
	const { data, ...rest } = api.whitelabeling.getPublic.useQuery(undefined, {
		staleTime: 5 * 60 * 1000,
		refetchOnWindowFocus: false,
	});
	return { config: data ?? null, ...rest };
}
